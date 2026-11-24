// Pipeline step → register filter. Mirrors STEP_STATUSES / approval_substep in
// safeops_360_bakend/app/services/ptw_ops/steps.py: approval sub-steps all sit
// under status SUBMITTED and are told apart by the workflow's current step name.

export const STEP_FILTERS: Record<string, { label: string; statuses: string[]; workflowStepContains?: string }> = {
  ISSUER_REVIEW: { label: "Issuer review", statuses: ["SUBMITTED"], workflowStepContains: "issuer" },
  SAFETY_REVIEW: { label: "Safety review", statuses: ["SUBMITTED"], workflowStepContains: "safety" },
  PLANT_HEAD_APPROVAL: { label: "Plant head", statuses: ["SUBMITTED"], workflowStepContains: "plant head" },
  APPROVAL: { label: "Other approval", statuses: ["SUBMITTED"] },
  AWAITING_ACCEPT: { label: "Issued · awaiting accept", statuses: ["APPROVED", "ISSUED"] },
  ACTIVE: { label: "Active", statuses: ["ACTIVE"] },
  SUSPENDED: { label: "Suspended", statuses: ["SUSPENDED"] },
  CLOSURE_PENDING: { label: "Closure pending", statuses: ["WORK_COMPLETED", "HANDBACK_INSPECTION"] },
};
