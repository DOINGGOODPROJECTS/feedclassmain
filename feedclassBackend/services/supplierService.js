const supplierRepository = require("../repositories/supplierRepository");
const supplierInvoiceRepository = require("../repositories/supplierInvoiceRepository");
const { getUserRole } = require("../lib/state");

function assertSupplierAccess(actor) {
  const role = getUserRole(actor.id);
  if (role === "ADMIN" || role === "SUPERVISOR") {
    return role;
  }
  throw new Error("Insufficient permissions.");
}

function normalizeSupplier(input = {}) {
  const name = String(input.name || "").trim();
  const contact = String(input.contact || "").trim();
  if (!name) {
    throw new Error("Supplier name is required");
  }
  if (!contact) {
    throw new Error("Supplier contact is required");
  }
  return {
    name,
    contact,
    active: input.active !== false,
  };
}

function normalizeMonth(value) {
  const month = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Invoice month must be in YYYY-MM format");
  }
  return month;
}

function normalizeDueDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid invoice due date");
  }
  return date;
}

function sanitizeInvoice(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    school_id: row.school_id,
    school_name: row.school_name,
    month: row.month,
    amount: Number(row.amount || 0),
    due_date: row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : null,
    status: row.status,
    paid_amount: Number(row.paid_amount || 0),
    last_paid_at: row.last_paid_at ? new Date(row.last_paid_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function listSuppliers(actor) {
  assertSupplierAccess(actor);
  return supplierRepository.listAll();
}

async function upsertSupplier(actor, input = {}) {
  assertSupplierAccess(actor);
  const normalized = normalizeSupplier(input);
  if (input.id) {
    return supplierRepository.update(input.id, normalized);
  }
  return supplierRepository.create(normalized);
}

async function listInvoices(actor, filters = {}) {
  const role = assertSupplierAccess(actor);
  const scopedSchoolId = role === "ADMIN" ? filters.school_id : actor.assignedSchoolId || filters.school_id;
  const rows = await supplierInvoiceRepository.listAll({
    schoolId: scopedSchoolId,
    month: filters.month,
    status: filters.status,
  });
  return rows.map(sanitizeInvoice);
}

async function createInvoice(actor, input = {}) {
  const role = assertSupplierAccess(actor);
  const schoolId = role === "ADMIN" ? String(input.schoolId || input.school_id || "").trim() : actor.assignedSchoolId;
  if (!schoolId) {
    throw new Error("schoolId is required");
  }
  const supplierId = String(input.supplierId || input.supplier_id || "").trim();
  if (!supplierId) {
    throw new Error("supplierId is required");
  }
  const amount = Number(input.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invoice amount must be greater than zero");
  }

  const row = await supplierInvoiceRepository.create({
    supplierId,
    schoolId,
    month: normalizeMonth(input.month),
    amount,
    dueDate: normalizeDueDate(input.dueDate || input.due_date),
    status: "DUE",
  });
  return sanitizeInvoice(row);
}

async function payInvoice(actor, invoiceId, input = {}) {
  const role = assertSupplierAccess(actor);
  const existing = await supplierInvoiceRepository.getById(invoiceId);
  if (!existing) {
    throw new Error("Invoice not found");
  }
  if (role !== "ADMIN" && actor.assignedSchoolId && actor.assignedSchoolId !== existing.school_id) {
    throw new Error("You can only manage invoices for your assigned school");
  }
  const paid = await supplierInvoiceRepository.markPaid(invoiceId, {
    amount: input.amount,
    paidAt: input.paid_at || input.paidAt || new Date(),
  });
  return sanitizeInvoice(paid);
}

async function getCostPerMeal(actor, filters = {}) {
  const role = assertSupplierAccess(actor);
  const schoolId = role === "ADMIN" ? filters.school_id : actor.assignedSchoolId || filters.school_id;
  const month = filters.month ? normalizeMonth(filters.month) : new Date().toISOString().slice(0, 7);
  return supplierInvoiceRepository.getCostPerMeal({ schoolId, month });
}

module.exports = {
  listSuppliers,
  upsertSupplier,
  listInvoices,
  createInvoice,
  payInvoice,
  getCostPerMeal,
};
