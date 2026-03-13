````md
# SOP: Migrating Legacy `.cursorrules` → Modular `.cursor/rules/*.mdc`

**Revision 1.1 — 2025-06-08**  
**Prepared by:** David Ondrej  

---

## 1  Purpose  
Standardize the transition from the single legacy `.cursorrules` file to modern, maintainable `.mdc` rule files under `.cursor/rules/`.

## 2  Scope  
Applies to every repository edited in Cursor that still contains `.cursorrules`.

## 3  Why This Change?  
- **Future-proof** — `.cursorrules` will be deprecated.  
- **Clarity & Git-friendly** — each rule is its own diffable file.  
- **Scoped Automation** — glob patterns auto-attach rules only when relevant.  
- **Rule Types** — explicit front-matter flags replace hidden behaviours.

## 4  Responsibilities  
- **Repo Owner:** Execute migration, remove legacy file.  
- **Developers:** Add/modify rules per this SOP.  
- **Reviewers:** Treat rule PRs like code.

## 5  Prerequisites  
- Cursor ≥ v0.33.  
- Local clone with write access.

## 6  Key Concepts  

| Rule Type | Behaviour | Front-matter Key |
|-----------|-----------|------------------|
| **Always** | Included in *every* AI context | `alwaysApply: true`, omit `globs` |
| **Auto Attached** | Auto-loads when `globs` match | `alwaysApply: false` + `globs` |
| **Agent Requested** | AI decides to pull rule in | same as Auto but relied on by AI |
| **Manual** | Only when you reference `@ruleName` | same as Agent; invoked manually |

> **Tip:** Most teams use **Always** for global standards and **Auto Attached** for file-specific guidance.

## 7  Rule File Template  

```md
---
description: TypeScript rules
globs: "**/*.ts,**/*.tsx"
alwaysApply: false      # true ⇒ Always rule
---

# TypeScript Rules
- Use strict compiler settings
- Explicit return types for all functions
- Prefer interfaces over type aliases
````

## 8  Folder Layout

```
project/
├── .cursor/
│   └── rules/
│       ├── general.mdc
│       ├── typescript.mdc
│       ├── react.mdc
│       ├── api.mdc
│       └── testing.mdc
└── src/…
```

Nested `.cursor/rules/` sub-folders give per-package granularity.

## 9  Procedure

1. **Audit**

   * Open `.cursorrules`; group content by topic.

2. **Prepare Structure**

   ```bash
   mkdir -p .cursor/rules
   ```

3. **Convert**

   * Create one `.mdc` per topic using the template above.
   * Map each legacy key to a bullet or heading.
   * Add `globs` to target specific files; omit for Always rules.

4. **Test**

   * In Cursor press `Cmd ⇧ P → “New Cursor Rule: Open rule picker”`.
   * Confirm new rules appear and legacy file is ignored.

5. **Iterate**

   * Migrate additional rules incrementally; keep legacy file until done.

6. **Finalize**

   ```bash
   git rm .cursorrules
   git add .cursor/rules
   git commit -m "Migrate to .mdc rule format"
   ```

## 10  Example Conversion

**Legacy (`.cursorrules`)**

```json
{
  "say": "Reply in English and be concise.",
  "commit_message": "Use Conventional Commits",
  "globs": ["src/**/*.ts"]
}
```

**Modern (`.cursor/rules/concise-and-commits.mdc`)**

```md
---
description: English concise replies + Conventional Commits
globs: "src/**/*.ts"
alwaysApply: false
---

- Reply in English only.  
- Keep answers concise.  
- Follow Conventional Commits for commits.
```

## 11  Post-Migration Checklist

* [ ] One concept per file (< 500 lines).
* [ ] Accurate `globs` or nested folder scope.
* [ ] Clear descriptions & examples.
* [ ] Rule PRs reviewed & merged.
* [ ] CI passes.

## 12  References

* Cursor Docs – Project Rules (`docs.cursor.com/context/rules`).
* Community script: cursorrules-to-mdc converter (Cursor forum).
* ADR-022 – “Cursor Rules Architecture”.

---

**End of SOP**

```
```
