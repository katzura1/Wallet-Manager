import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { seedDefaultCategories, seedDefaultSettings } from "./db/db";
import { processRecurringTransactions } from "./db/recurring";

// Initialize DB seeds, process overdue recurring transactions, apply saved theme
async function init() {
  await seedDefaultCategories();
  await seedDefaultSettings();
  await processRecurringTransactions();
  const theme = localStorage.getItem("theme") as "light" | "dark" | null;
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  }
}

void init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
