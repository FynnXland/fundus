// The door for the admin dashboard (admin.fynn.land binds { service: "fundus", entrypoint: "Admin" }): today's calls,
// the access keys by their short name, grants by hand. The logic is in zugang.mjs, so tests run without workerd.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { admin } from './zugang.mjs';

export class Admin extends WorkerEntrypoint {
  counts() { return admin.counts(this.env); }
  list() { return admin.list(this.env); }
  grant(kennung, grenze, notiz) { return admin.grant(this.env, kennung, grenze, notiz); }
  reset(kennung) { return admin.reset(this.env, kennung); }
  block(kennung) { return admin.block(this.env, kennung, true); }
  unblock(kennung) { return admin.block(this.env, kennung, false); }
}
