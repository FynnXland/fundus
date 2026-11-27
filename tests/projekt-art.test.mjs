// GitHub projects that are really skills or 3D models (crawler/lib/projekte.mjs, projektArt) and the subfolders of
// skills (crawler/lib/taxonomy.mjs). The repositories are real ones from the samples of 27.11.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projektArt, istSkillRepo, ist3dRepo } from '../crawler/lib/projekte.mjs';
import { unterkategorie, SKILL_SAMMLUNG } from '../crawler/lib/taxonomy.mjs';

const MIT = { id: 'MIT', family: 'code' };
const CC0 = { id: 'CC0-1.0', family: 'gemeinfrei' };
const BYSA = { id: 'CC-BY-SA-4.0', family: 'cc' };
const repo = (title, description, tags = [], license = MIT) => ({ kind: 'projekt', source: { id: 'github' }, title, description, tags, license });

test('Skill-Repositories: Name oder Beschreibung sagt Skill, dazu ein KI-Bezug', () => {
  for (const [t, d, tags] of [
    ['comfy-skills', 'Comfy Cloud product skills: slash commands for generating images, video, audio, and 3D with Comfy Cloud agents.', ['skills']],
    ['steve-jobs-skill', '乔布斯.skill — Steve Jobs的认知操作系统。', ['agent-skills', 'claude-skills']],
    ['web-design', 'A Claude Code SKILL for designing beautiful, consistent web pages — spec first, code second.'],
    ['skills', 'Supercharge your AI agents/bots with reusable skills'],
    ['skills', 'Agent Skills and plugins for NVIDIA products — install into Claude Code, Codex, and other coding agents'],
    ['baoyu-skills', '', ['claude-skills']],
    ['pm-skills', 'PM Skills Marketplace: 100+ agentic skills, commands, and plugins'],
  ]) assert.equal(istSkillRepo({ title: t, description: d, tags }), true, `${t}: ${d}`);
});

test('Skill-Repositories: Werkzeuge rund um Skills, Agenten mit Skill-Topic und Lebensläufe bleiben Projekte', () => {
  for (const [t, d, tags] of [
    ['skillhub', 'Self-hosted, open-source agent skill registry for enterprises. Publish & version skill packages'],
    ['browsing-skills', 'Open-source registry of browser-automation skills for AI agents'],
    ['skill-porter', 'Universal tool to convert Claude Code skills to Gemini CLI extensions and vice versa'],
    ['LazyMind', 'An AI Skill Runtime for knowledge-intensive work which makes everything under your control.'],
    ['google-health-cli', 'Google Health CLI — one command-line tool for the Google Health API. Includes AI agent skills.'],
    ['openclacky', 'The Most Token-Efficient Lightweight AI Agent', ['skills']],
    ['OfficeCLI', 'OfficeCLI is the first and best Office suite purpose-built for AI agents to read, edit, and automate Word', ['skills']],
    ['portfolio-template', 'An Open-Sourced Template for developers to show-off there skills. Made with ReactJS', ['skills']],
    ['soft-skills', 'List of Soft Skills for software engineers/developers.'],
  ]) assert.equal(istSkillRepo({ title: t, description: d, tags }), false, `${t}: ${d}`);
});

test('3D-Repositories: nur mit CC- oder gemeinfreier Lizenz und wenn die Beschreibung Modelle nennt', () => {
  assert.equal(ist3dRepo(repo('ferris3d', 'A free 3D model of Ferris the rustacean', ['3d-models'], CC0)), true);
  assert.equal(ist3dRepo(repo('KLP-Lame-Keycaps', 'Sculpted and curved keycaps for Kailh Choc and MX switches', ['3d-printing', 'stl'], BYSA)), true);
  assert.equal(ist3dRepo(repo('Thor', 'DIY 3D Printable Robotic Arm', [], BYSA)), true);
  // the same kind of repository under MIT: the licence of the code says nothing reliable about the models
  assert.equal(ist3dRepo(repo('kicad-3d-models-in-freecad', 'kicad 3d models in freecad', ['3d-models'])), false);
  // tools, lists, electrical CAD and printers stay projects
  assert.equal(ist3dRepo(repo('awesome-3d-printing', 'A curated list of awesome 3D printing resources', [], CC0)), false);
  assert.equal(ist3dRepo(repo('LMN-3-ECAD', 'Electrical CAD Files for the LMN-3 Project', [], BYSA)), false);
  assert.equal(ist3dRepo(repo('PositronV3', 'A upside-down, fast, portable, and compact 3D printer', [], { family: 'cc' })), false);
  assert.equal(ist3dRepo(repo('specs', 'Specifications for CityJSON, a JSON-based encoding for 3D city models', ['3d-models'], CC0)), false);
});

test('projektArt: nur GitHub-Projekte, Skill vor 3D', () => {
  assert.equal(projektArt(repo('ferris3d', 'A free 3D model of Ferris the rustacean', [], CC0)), '3d');
  assert.equal(projektArt(repo('dagster-skills', 'A collection of AI skills for working with Dagster')), 'skill');
  assert.equal(projektArt(repo('ripgrep', 'ripgrep recursively searches directories for a regex pattern')), null);
  assert.equal(projektArt({ ...repo('x-skill', 'A Claude skill'), kind: 'skript' }), null);
  assert.equal(projektArt({ ...repo('x-skill', 'A Claude skill'), source: { id: 'gitlab' } }), null);
});

test('Skill-Ordner: die Namen der Agenten zählen nicht, ganze Sammlungen bekommen einen eigenen Ordner', () => {
  const skill = (title, description, extra = {}) => unterkategorie({ kind: 'skill', source: { id: 'github' }, title, description, tags: ['claude-code', 'skill'], collection: { id: 'a/b' }, ...extra });
  assert.equal(skill('journalism', 'Claude Code skills for journalism, media, and academia - verification, FOIA'), 'Recherche & Schreiben');
  assert.equal(skill('pptx', 'Create and edit PowerPoint presentations'), 'Dokumente & Präsentationen');
  assert.equal(skill('recon', 'Recon & pentest skill pack. CORS, XSS, SQLi, SSRF'), 'Sicherheit');
  assert.equal(skill('test-driven-development', 'Use when implementing any feature or bugfix, before writing implementation code'), 'Entwicklung');
  assert.equal(skill('ab-test-analysis', 'Analyze A/B test results with statistical significance'), 'Daten & Analyse');
  // a repository of many skills, moved from the projects (no collection of its own)
  assert.equal(skill('skills', 'Agent Skills and plugins for NVIDIA products', { collection: undefined }), SKILL_SAMMLUNG);
  assert.equal(skill('pawbytes-suites', '50+ AI agent skills for Claude, Codex, OpenClaw etc', { collection: undefined }), SKILL_SAMMLUNG);
  // a single skill read from a SKILL.md never counts as a collection, whatever its folder is called
  assert.notEqual(skill('release-skills', 'Universal release workflow. Auto-detects version files and changelogs.'), SKILL_SAMMLUNG);
});
