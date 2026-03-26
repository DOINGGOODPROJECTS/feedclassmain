const crypto = require("crypto");
const { appendActivityLog } = require("./auditService");

const DEFAULT_PLANS = [
  {
    name: "Standard Lunch Plan",
    mealType: "LUNCH",
    mealsPerCycle: 20,
    price: 150,
    active: true,
  },
  {
    name: "Standard Breakfast Plan",
    mealType: "BREAKFAST",
    mealsPerCycle: 20,
    price: 120,
    active: true,
  },
  {
    name: "Standard Dinner Plan",
    mealType: "DINNER",
    mealsPerCycle: 20,
    price: 180,
    active: true,
  },
];

function sanitizePlan(plan) {
  if (!plan) {
    return null;
  }

  return {
    id: plan.id,
    name: plan.name,
    mealType: plan.mealType || plan.meal_type,
    mealsPerCycle: Number(plan.mealsPerCycle || plan.meals_per_cycle || 0),
    price: Number(plan.price || 0),
    active: Boolean(plan.active),
    effectiveStartDate:
      plan.effectiveStartDate || plan.effective_start_date
        ? String(plan.effectiveStartDate || plan.effective_start_date)
        : null,
    effectiveEndDate:
      plan.effectiveEndDate || plan.effective_end_date
        ? String(plan.effectiveEndDate || plan.effective_end_date)
        : null,
    createdAt: plan.createdAt || plan.created_at,
    updatedAt: plan.updatedAt || plan.updated_at,
  };
}

async function ensureDefaultPlans(planRepository) {
  const existing = await planRepository.listAll();
  if (existing.length > 0) {
    return existing.map(sanitizePlan);
  }

  const now = new Date().toISOString();
  for (const entry of DEFAULT_PLANS) {
    await planRepository.createPlanRecord({
      id: crypto.randomUUID(),
      ...entry,
      effectiveStartDate: null,
      effectiveEndDate: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const seeded = await planRepository.listAll();
  return seeded.map(sanitizePlan);
}

function normalizeMealType(mealType) {
  const normalized = String(mealType || "").trim().toUpperCase();
  if (!["BREAKFAST", "LUNCH", "DINNER"].includes(normalized)) {
    throw new Error("meal_type must be BREAKFAST, LUNCH, or DINNER");
  }
  return normalized;
}

function normalizeDate(value, fieldName) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return parsed.toISOString().slice(0, 10);
}

function validatePlanInput(input) {
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("name is required");
  }

  const mealType = normalizeMealType(input.meal_type || input.mealType);
  const mealsPerCycle = Number(input.meals_per_cycle ?? input.mealsPerCycle);
  const price = Number(input.price);

  if (!Number.isFinite(mealsPerCycle) || mealsPerCycle < 1) {
    throw new Error("meals_per_cycle must be at least 1");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("price must be 0 or greater");
  }

  const effectiveStartDate = normalizeDate(input.effective_start_date || input.effectiveStartDate, "effective_start_date");
  const effectiveEndDate = normalizeDate(input.effective_end_date || input.effectiveEndDate, "effective_end_date");

  if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
    throw new Error("effective_end_date cannot be before effective_start_date");
  }

  return {
    name,
    mealType,
    mealsPerCycle,
    price,
    active: input.active !== false,
    effectiveStartDate,
    effectiveEndDate,
  };
}

function buildCreatePlan(actor, input) {
  const normalized = validatePlanInput(input);
  const now = new Date().toISOString();

  const plan = {
    id: crypto.randomUUID(),
    ...normalized,
    createdAt: now,
    updatedAt: now,
  };

  appendActivityLog(actor.id, {
    entityType: "subscription_plan",
    entityId: plan.id,
    action: "plan.create",
    detail: `Created subscription plan ${plan.name}`,
    before: null,
    after: sanitizePlan(plan),
  });

  return plan;
}

function buildUpdatePlan(actor, existing, input) {
  const before = sanitizePlan(existing);
  const normalized = validatePlanInput({
    ...sanitizePlan(existing),
    ...input,
  });

  const updated = {
    ...existing,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };

  appendActivityLog(actor.id, {
    entityType: "subscription_plan",
    entityId: updated.id,
    action: "plan.update",
    detail: `Updated subscription plan ${updated.name}`,
    before,
    after: sanitizePlan(updated),
  });

  return updated;
}

function buildDeletePlan(actor, existing) {
  appendActivityLog(actor.id, {
    entityType: "subscription_plan",
    entityId: existing.id,
    action: "plan.delete",
    detail: `Deleted subscription plan ${existing.name}`,
    before: sanitizePlan(existing),
    after: null,
  });
}

module.exports = {
  sanitizePlan,
  buildCreatePlan,
  buildUpdatePlan,
  buildDeletePlan,
  ensureDefaultPlans,
};
