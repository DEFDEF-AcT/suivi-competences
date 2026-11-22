// Gestion des collègues, réservée à l'administrateur : lister, ajouter (compte + mot de passe provisoire),
// modifier les accès, réinitialiser le mot de passe, retirer.
// La clé de service ne quitte jamais ce serveur ; chaque appel vérifie d'abord, avec la session de
// l'appelant (double authentification comprise), qu'il s'agit bien de l'administrateur.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = new Set(["https://defdef-act.github.io", "http://localhost:8765"]);

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : "https://defdef-act.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function tempPassword(): string {
  const b = crypto.getRandomValues(new Uint8Array(14));
  let s = "";
  for (const x of b) s += ALPHA[x % ALPHA.length];
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10)}!7`;
}
function cleanAccess(a: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const app of ["ismi", "bts"]) {
    const v = a?.[app];
    if (!v || typeof v !== "object") continue;
    const cls = v.classes;
    out[app] = {
      classes: Array.isArray(cls)
        ? [...new Set(cls.filter((c: unknown) => typeof c === "string" && c.length > 0 && c.length <= 200))].slice(0, 200)
        : null,
    };
  }
  if (a?.pre === true) out.pre = true;
  return out;
}
const cleanName = (n: unknown) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "Méthode non autorisée." });

  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) return reply(req, 401, { error: "Connexion requise." });
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: me, error: meErr } = await asUser.rpc("my_access");
  if (meErr || !me || me.role !== "admin") return reply(req, 403, { error: "Réservé à l'administrateur." });

  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: any;
  try { body = await req.json(); } catch { return reply(req, 400, { error: "Requête invalide." }); }

  try {
    switch (body?.action) {
      case "list": {
        const { data, error } = await db.from("members")
          .select("user_id, display_name, email, role, access, must_change_password, created_at").order("created_at");
        if (error) throw error;
        const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
        const last = new Map((list?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
        return reply(req, 200, {
          members: data.map((m) => ({ ...m, last_sign_in_at: last.get(m.user_id) ?? null, me: m.user_id === me.user_id })),
        });
      }
      case "create": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const name = cleanName(body.name);
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(req, 400, { error: "Indiquez un nom et une adresse e-mail valides." });
        const password = tempPassword();
        const { data: cu, error: ce } = await db.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { display_name: name },
        });
        if (ce || !cu?.user) {
          const m = ce?.message ?? "";
          return reply(req, 400, { error: /already|registered|exists/i.test(m) ? "Un compte existe déjà avec cette adresse." : "Création impossible : " + m });
        }
        const { error: ie } = await db.from("members").insert({
          user_id: cu.user.id, display_name: name, email, role: "collegue",
          access: cleanAccess(body.access), must_change_password: true,
        });
        if (ie) { await db.auth.admin.deleteUser(cu.user.id); throw ie; }
        return reply(req, 200, { user_id: cu.user.id, email, password });
      }
      case "update":
      case "reset":
      case "remove": {
        const id = String(body.user_id ?? "");
        const { data: target, error: te } = await db.from("members").select("user_id, role, email").eq("user_id", id).maybeSingle();
        if (te) throw te;
        if (!target) return reply(req, 404, { error: "Compte introuvable." });
        if (target.role === "admin") return reply(req, 400, { error: "Le compte administrateur ne se modifie pas ici." });

        if (body.action === "update") {
          const patch: Record<string, unknown> = { access: cleanAccess(body.access) };
          const name = cleanName(body.name);
          if (name) patch.display_name = name;
          const { error } = await db.from("members").update(patch).eq("user_id", id);
          if (error) throw error;
          return reply(req, 200, { ok: true });
        }
        if (body.action === "reset") {
          const password = tempPassword();
          const { error } = await db.auth.admin.updateUserById(id, { password });
          if (error) throw error;
          // Téléphone perdu : la double authentification est aussi remise à zéro.
          const { data: f } = await db.auth.admin.mfa.listFactors({ userId: id });
          for (const x of f?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ id: x.id, userId: id });
          await db.from("members").update({ must_change_password: true }).eq("user_id", id);
          return reply(req, 200, { email: target.email, password });
        }
        // remove : l'accès est coupé, le compte supprimé ; les évaluations et notes restent.
        const { error: de } = await db.from("members").delete().eq("user_id", id);
        if (de) throw de;
        const { error: ue } = await db.auth.admin.deleteUser(id);
        if (ue) throw ue;
        return reply(req, 200, { ok: true });
      }
      default:
        return reply(req, 400, { error: "Action inconnue." });
    }
  } catch (e) {
    return reply(req, 500, { error: (e as Error)?.message ?? String(e) });
  }
});
