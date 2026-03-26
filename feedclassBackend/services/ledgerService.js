const { getUserRole } = require("../lib/state");
const ledgerRepository = require("../repositories/ledgerRepository");

const ALLOWED_TYPES = new Set(["SUBSCRIPTION_PURCHASE", "DEBIT_MEAL", "GRACE_MEAL", "ADJUSTMENT"]);

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date filter");
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeFilters(input = {}) {
  const filters = {
    childId: input.child_id ? String(input.child_id).trim() : "",
    schoolId: input.school_id ? String(input.school_id).trim() : "",
    type: input.type ? String(input.type).trim().toUpperCase() : "",
    dateFrom: normalizeDate(input.date_from),
    dateTo: normalizeDate(input.date_to),
  };

  if (filters.type && !ALLOWED_TYPES.has(filters.type)) {
    throw new Error("Invalid ledger transaction type");
  }

  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new Error("date_from must be before or equal to date_to");
  }

  return filters;
}

function sanitizeTransaction(row) {
  return {
    id: row.id,
    child_id: row.child_id,
    student_id: row.student_id,
    child_name: row.child_name,
    school_id: row.school_id,
    school_name: row.school_name || "",
    class_id: row.class_id || "",
    class_name: row.class_name || "-",
    payment_intent_id: row.payment_intent_id || null,
    type: row.type,
    amount: Number(row.amount || 0),
    metadata:
      row.metadata_json && typeof row.metadata_json === "string"
        ? JSON.parse(row.metadata_json)
        : row.metadata_json || {},
    created_at: new Date(row.created_at).toISOString(),
  };
}

async function listLedgerTransactions(actor, inputFilters = {}) {
  const role = getUserRole(actor.id);
  const filters = normalizeFilters(inputFilters);

  if (role === "DONOR_READONLY") {
    if (filters.childId) {
      throw new Error("Donor access is limited to aggregate ledger data");
    }

    const aggregates = await ledgerRepository.getAggregates(filters);
    return {
      transactions: [],
      aggregates: aggregates.map((row) => ({
        type: row.type,
        total_count: Number(row.total_count || 0),
        total_amount: Number(row.total_amount || 0),
      })),
      scope: "aggregate_only",
    };
  }

  const transactions = await ledgerRepository.listTransactions(filters);
  const aggregates = await ledgerRepository.getAggregates(filters);

  return {
    transactions: transactions.map(sanitizeTransaction),
    aggregates: aggregates.map((row) => ({
      type: row.type,
      total_count: Number(row.total_count || 0),
      total_amount: Number(row.total_amount || 0),
    })),
    scope: "full",
  };
}

module.exports = {
  listLedgerTransactions,
};
