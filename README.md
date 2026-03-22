# Wallet Manager PWA

## Next Agent Backlog

### Current State

#### Recently completed
- Dashboard made more compact
	- Upcoming bills surfaced in Dashboard
	- Budget alerts surfaced in Dashboard
	- Priority info merged into a compact "Perlu Perhatian" card
	- Accounts section is collapsible
	- Recent transactions default to 3 items with expand toggle
- Reports improved
	- Month-over-month comparison added to summary cards
	- Reports layout made more compact for mobile
	- Category spending and budget usage now use net category spending:
		- expense adds to category usage
		- income with the same category subtracts from category usage
		- result is clamped at minimum 0
- Transactions UX improved
	- Transaction form stores smart defaults in localStorage
	- Transactions page shows active filter chips with quick remove
- Reimburse and patungan guidance added
	- Helper text in TransactionForm explains using the same category for reimburse
	- Quick note presets added for expense and income reimbursement-like flows
	- Budget report separates unused budget categories into a dedicated subsection

### Important Logic Decisions
- Net category spending is intentional and implemented in [src/db/transactions.ts](/Users/denny/Documents/Dev/Web/wallet/src/db/transactions.ts)
- A reimbursement should be recorded as income using the same category as the original expense so reports and budgets reflect real net spending.
- Budget usage and dashboard budget alerts already depend on this net category logic.

### Files Most Relevant For Next Work
- [src/pages/Dashboard.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Dashboard.tsx)
- [src/pages/Reports.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Reports.tsx)
- [src/pages/Transactions.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Transactions.tsx)
- [src/components/forms/TransactionForm.tsx](/Users/denny/Documents/Dev/Web/wallet/src/components/forms/TransactionForm.tsx)
- [src/db/transactions.ts](/Users/denny/Documents/Dev/Web/wallet/src/db/transactions.ts)
- [src/db/budgets.ts](/Users/denny/Documents/Dev/Web/wallet/src/db/budgets.ts)
- [src/stores/walletStore.ts](/Users/denny/Documents/Dev/Web/wallet/src/stores/walletStore.ts)

### Recommended Next Backlog

#### 1. Reimburse workflow in TransactionForm
Priority: High
Goal: Turn reimburse guidance into an actual workflow instead of only hint text.

Possible scope:
- Add a visible toggle or preset like "Reimburse / Patungan"
- When enabled for income:
	- highlight that category should match original expense
	- optionally prefill note presets and keep category required
- When enabled for expense:
	- allow marking as talangan or patungan upfront

Likely files:
- [src/components/forms/TransactionForm.tsx](/Users/denny/Documents/Dev/Web/wallet/src/components/forms/TransactionForm.tsx)
- [src/db/transactions.ts](/Users/denny/Documents/Dev/Web/wallet/src/db/transactions.ts)

#### 2. Gross vs Net toggle in Reports
Priority: High
Goal: Let user inspect either pure expense totals or expense-minus-reimburse totals.

Possible scope:
- Add toggle in Reports: Gross / Net
- Net stays current default behavior
- Gross should use raw expense-only aggregation
- Apply toggle to:
	- category chart
	- category table
	- budget section

Likely files:
- [src/pages/Reports.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Reports.tsx)
- [src/db/transactions.ts](/Users/denny/Documents/Dev/Web/wallet/src/db/transactions.ts)

Implementation note:
- Do not replace the current net logic. Add a parallel query or a parameterized function.

#### 3. Dashboard monthly comparison micro-summary
Priority: Medium
Goal: Reuse reports comparison insight in compact form on Dashboard.

Possible scope:
- Add tiny comparison text under month income and expense cards
- Keep compact layout; avoid adding tall new sections

Likely files:
- [src/pages/Dashboard.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Dashboard.tsx)
- [src/db/transactions.ts](/Users/denny/Documents/Dev/Web/wallet/src/db/transactions.ts)

#### 4. Transactions filter panel refinement
Priority: Medium
Goal: Reduce filter friction further.

Possible scope:
- Auto-close filter panel when no filters are active
- Persist show or hide preference only if needed
- Optional quick presets: today, this week, this month

Likely files:
- [src/pages/Transactions.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Transactions.tsx)

#### 5. Recurring form smart defaults
Priority: Medium
Goal: Match TransactionForm speed improvements.

Possible scope:
- Persist last used recurring type, account, category, and interval
- Reset cleanly on open while preserving edit behavior

Likely files:
- [src/components/forms/RecurringForm.tsx](/Users/denny/Documents/Dev/Web/wallet/src/components/forms/RecurringForm.tsx)

#### 6. Budget visibility improvements
Priority: Medium
Goal: Make budget health easier to scan.

Possible scope:
- Separate sections in Reports:
	- over budget
	- near limit
	- unused
- Optional sort mode toggle by percentage used vs remaining amount

Likely files:
- [src/pages/Reports.tsx](/Users/denny/Documents/Dev/Web/wallet/src/pages/Reports.tsx)

### Guardrails For Next Agent
- Keep Tailwind dark-mode-aware styles using CSS vars, not hardcoded light-only colors.
- Prefer compact mobile-first layout; avoid adding tall sections to Dashboard or Reports.
- Keep changes minimal and reuse existing Card, Button, and Modal patterns.
- After DB-affecting changes, preserve existing refreshAll flow.
- If adding new DB schema, follow Dexie additive versioning only.

### Validation Command
```bash
cd /Users/denny/Documents/Dev/Web/wallet
npm run build
```

### Suggested Execution Order
1. Reimburse workflow in TransactionForm
2. Gross vs Net toggle in Reports
3. Dashboard monthly comparison micro-summary
4. Transactions filter panel refinement
5. Recurring form smart defaults
