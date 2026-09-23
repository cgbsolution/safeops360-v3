// ────────────────────────────────────────────────────────────────────────
// Seed — BRSR Reporting
//
// Three catalogues, all additive + idempotent (upsert by natural key), safe to
// re-run:
//   1. BrsrIndicator      — the SEBI disclosure taxonomy (Sections A, B, C×P1–P9)
//   2. BrsrDataSource     — indicator → module/resolver mappings (P1/P3/P5/P6/P9)
//   3. BrsrEmissionFactor — Indian grid + fuel factors, each with its citation
//
// Creates NO cycles and NO values. A reporting cycle is opened by a person
// through the UI; seeding one would put a fake disclosure in a live tenant.
//
// ⚠ TWO THINGS TO VERIFY BEFORE A LIVE FILING
//
//   • INDICATOR WORDING. The labels below are drafted from the SEBI BRSR format
//     as understood at build time. They are marked sebiFormatVersion =
//     'DRAFT-UNVERIFIED' precisely so a reviewer can find every one of them with
//     a single query and reconcile against the current SEBI circular. This is
//     the same discipline the CAMS clause citations are held to.
//
//   • EMISSION FACTOR VALUES. Each factor carries its published source, but the
//     numeric values were transcribed at build time and are NOT verified against
//     the source documents. A Scope 1/2 figure is only as defensible as its
//     factor. Check them, then clear the warning in `notes`.
//
//   npx tsx prisma/seed-brsr.ts
// ────────────────────────────────────────────────────────────────────────

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FORMAT_VERSION = "DRAFT-UNVERIFIED";
const FACTOR_WARNING =
  "Value transcribed at build time and NOT verified against the cited source. " +
  "Verify before relying on any Scope 1/2 figure derived from it.";

type Ind = {
  code: string;
  section: "A" | "B" | "C";
  principle?: string;
  cls?: "ESSENTIAL" | "LEADERSHIP";
  label: string;
  group?: string;
  guidance?: string;
  type?: "NUMBER" | "TEXT" | "BOOLEAN" | "TABLE";
  unit?: string;
  table?: { key: string; label: string; type: string }[];
  mandatory?: boolean;
};

// Standard current-FY / previous-FY grid — the shape most BRSR quantitative
// indicators take.
const FY_GRID = [
  { key: "currentFy", label: "FY (current reporting year)", type: "NUMBER" },
  { key: "previousFy", label: "FY (previous reporting year)", type: "NUMBER" },
];

// Male / female split grid, used across the P3 and P5 headcount disclosures.
const GENDER_GRID = [
  { key: "total", label: "Total (A)", type: "NUMBER" },
  { key: "male", label: "Male — No. (B)", type: "NUMBER" },
  { key: "malePct", label: "Male — % (B/A)", type: "NUMBER" },
  { key: "female", label: "Female — No. (C)", type: "NUMBER" },
  { key: "femalePct", label: "Female — % (C/A)", type: "NUMBER" },
];

// ── SECTION A — Details of the listed entity ────────────────────────────────
const SECTION_A: Ind[] = [
  { code: "A.1", section: "A", label: "Corporate Identity Number (CIN) of the Listed Entity", type: "TEXT" },
  { code: "A.2", section: "A", label: "Name of the Listed Entity", type: "TEXT" },
  { code: "A.3", section: "A", label: "Year of incorporation", type: "TEXT" },
  { code: "A.4", section: "A", label: "Registered office address", type: "TEXT" },
  { code: "A.5", section: "A", label: "Corporate address", type: "TEXT" },
  { code: "A.6", section: "A", label: "E-mail", type: "TEXT" },
  { code: "A.7", section: "A", label: "Telephone", type: "TEXT" },
  { code: "A.8", section: "A", label: "Website", type: "TEXT" },
  { code: "A.9", section: "A", label: "Financial year for which reporting is being done", type: "TEXT" },
  { code: "A.10", section: "A", label: "Name of the Stock Exchange(s) where shares are listed", type: "TEXT" },
  { code: "A.11", section: "A", label: "Paid-up Capital", type: "NUMBER", unit: "INR" },
  { code: "A.12", section: "A", label: "Name and contact details of the person who may be contacted in case of any queries on the BRSR report", type: "TEXT" },
  { code: "A.13", section: "A", label: "Reporting boundary — standalone basis or consolidated basis", type: "TEXT" },
  {
    code: "A.14", section: "A", label: "Details of business activities (accounting for 90% of the turnover)",
    type: "TABLE",
    table: [
      { key: "mainActivity", label: "Description of Main Activity", type: "TEXT" },
      { key: "businessActivity", label: "Description of Business Activity", type: "TEXT" },
      { key: "turnoverPct", label: "% of Turnover of the entity", type: "NUMBER" },
    ],
  },
  {
    code: "A.15", section: "A", label: "Products/Services sold by the entity (accounting for 90% of the entity's Turnover)",
    type: "TABLE",
    table: [
      { key: "product", label: "Product/Service", type: "TEXT" },
      { key: "nic", label: "NIC Code", type: "TEXT" },
      { key: "turnoverPct", label: "% of total Turnover contributed", type: "NUMBER" },
    ],
  },
  {
    code: "A.16", section: "A", label: "Number of locations where plants and/or operations/offices of the entity are situated",
    type: "TABLE",
    table: [
      { key: "location", label: "Location", type: "TEXT" },
      { key: "plants", label: "Number of plants", type: "NUMBER" },
      { key: "offices", label: "Number of offices", type: "NUMBER" },
      { key: "total", label: "Total", type: "NUMBER" },
    ],
  },
  { code: "A.17", section: "A", label: "Markets served by the entity — number of locations (National / International)", type: "TABLE", table: [{ key: "national", label: "National (No. of States)", type: "NUMBER" }, { key: "international", label: "International (No. of Countries)", type: "NUMBER" }] },
  { code: "A.18", section: "A", label: "Contribution of exports as a percentage of the total turnover", type: "NUMBER", unit: "%" },
  { code: "A.19", section: "A", label: "A brief on types of customers", type: "TEXT" },
  { code: "A.20", section: "A", label: "Details as at the end of Financial Year — Employees and workers (including differently abled)", type: "TABLE", table: GENDER_GRID },
  { code: "A.21", section: "A", label: "Differently abled Employees and workers", type: "TABLE", table: GENDER_GRID },
  { code: "A.22", section: "A", label: "Participation/Inclusion/Representation of women — Board of Directors and Key Management Personnel", type: "TABLE", table: GENDER_GRID },
  {
    code: "A.23", section: "A", label: "Turnover rate for permanent employees and workers",
    type: "TABLE",
    table: [
      { key: "currentFyMale", label: "Current FY — Male", type: "NUMBER" },
      { key: "currentFyFemale", label: "Current FY — Female", type: "NUMBER" },
      { key: "currentFyTotal", label: "Current FY — Total", type: "NUMBER" },
      { key: "previousFyTotal", label: "Previous FY — Total", type: "NUMBER" },
    ],
  },
  { code: "A.24", section: "A", label: "Names of holding / subsidiary / associate companies / joint ventures", type: "TABLE", table: [{ key: "name", label: "Name", type: "TEXT" }, { key: "type", label: "Holding / Subsidiary / Associate / JV", type: "TEXT" }, { key: "sharePct", label: "% of shares held by listed entity", type: "NUMBER" }] },
  { code: "A.25", section: "A", label: "CSR Details — whether CSR is applicable as per Section 135 of Companies Act, 2013", type: "BOOLEAN" },
  { code: "A.26", section: "A", label: "Transparency and Disclosures Compliances — complaints/grievances on any of the Principles", type: "TABLE", table: [{ key: "stakeholder", label: "Stakeholder group", type: "TEXT" }, { key: "filed", label: "Filed during the year", type: "NUMBER" }, { key: "pending", label: "Pending resolution at close of the year", type: "NUMBER" }] },
  { code: "A.27", section: "A", label: "Overview of the entity's material responsible business conduct issues", type: "TABLE", table: [{ key: "issue", label: "Material issue identified", type: "TEXT" }, { key: "riskOpportunity", label: "Indicate whether risk or opportunity", type: "TEXT" }, { key: "rationale", label: "Rationale for identifying the risk/opportunity", type: "TEXT" }, { key: "approach", label: "In case of risk, approach to adapt or mitigate", type: "TEXT" }, { key: "financialImplication", label: "Financial implications of the risk or opportunity", type: "TEXT" }] },
];

// ── SECTION B — Management and process disclosures ──────────────────────────
const SECTION_B: Ind[] = [
  {
    code: "B.1", section: "B",
    label: "Policy and management processes — whether the entity's policy/policies cover each Principle and its core elements of the NGRBCs",
    type: "TABLE",
    table: [
      { key: "principle", label: "Principle", type: "TEXT" },
      { key: "policyCovers", label: "Policy covers the Principle (Yes/No)", type: "TEXT" },
      { key: "boardApproved", label: "Board approved (Yes/No)", type: "TEXT" },
      { key: "webLink", label: "Web link of the policies", type: "TEXT" },
    ],
  },
  { code: "B.2", section: "B", label: "Whether the entity has translated the policy into procedures", type: "TEXT" },
  { code: "B.3", section: "B", label: "Do the enlisted policies extend to your value chain partners?", type: "TEXT" },
  { code: "B.4", section: "B", label: "Name of the national and international codes/certifications/labels/standards adopted by your entity and mapped to each principle", type: "TEXT" },
  { code: "B.5", section: "B", label: "Specific commitments, goals and targets set by the entity with defined timelines, if any", type: "TEXT" },
  { code: "B.6", section: "B", label: "Performance of the entity against the specific commitments, goals and targets — along with reasons in case the same are not met", type: "TEXT" },
  { code: "B.7", section: "B", label: "Statement by director responsible for the business responsibility report", type: "TEXT" },
  { code: "B.8", section: "B", label: "Details of the highest authority responsible for implementation and oversight of the Business Responsibility policy(ies)", type: "TEXT" },
  { code: "B.9", section: "B", label: "Does the entity have a specified Committee of the Board/Director responsible for decision making on sustainability related issues?", type: "TEXT" },
  { code: "B.10", section: "B", label: "Details of Review of NGRBCs by the Company", type: "TABLE", table: [{ key: "subject", label: "Subject for Review", type: "TEXT" }, { key: "undertakenBy", label: "Undertaken by Director / Committee of the Board / Any other Committee", type: "TEXT" }, { key: "frequency", label: "Frequency", type: "TEXT" }] },
  { code: "B.11", section: "B", label: "Has the entity carried out independent assessment/evaluation of the working of its policies by an external agency?", type: "TEXT" },
  { code: "B.12", section: "B", label: "If answer to question (1) above is 'No', the reasons to be stated", type: "TEXT", mandatory: false },
];

// ── SECTION C — Principle-wise performance ──────────────────────────────────

// P1 — Ethics, Transparency and Accountability
const P1: Ind[] = [
  { code: "C.P1.EI.1", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Percentage coverage by training and awareness programmes on any of the Principles during the financial year", type: "TABLE", table: [{ key: "segment", label: "Segment", type: "TEXT" }, { key: "programmes", label: "Total number of training and awareness programmes held", type: "NUMBER" }, { key: "topics", label: "Topics/principles covered under the training", type: "TEXT" }, { key: "coveragePct", label: "%age of persons covered", type: "NUMBER" }] },
  { code: "C.P1.EI.2", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Details of fines/penalties/punishment/award/compounding fees/settlement amount paid in proceedings with regulators/law enforcement agencies/judicial institutions", type: "TABLE", table: [{ key: "type", label: "NGRBC Principle", type: "TEXT" }, { key: "authority", label: "Name of the regulatory/enforcement agencies/judicial institutions", type: "TEXT" }, { key: "amount", label: "Amount (In INR)", type: "NUMBER" }, { key: "brief", label: "Brief of the Case", type: "TEXT" }, { key: "appeal", label: "Has an appeal been preferred?", type: "TEXT" }] },
  { code: "C.P1.EI.3", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Details of the Anti-corruption or anti-bribery policy", type: "TEXT" },
  { code: "C.P1.EI.4", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Number of Directors/KMPs/employees/workers against whom disciplinary action was taken by any law enforcement agency for the charges of bribery/corruption", type: "TABLE", table: FY_GRID },
  { code: "C.P1.EI.5", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Details of complaints with regard to conflict of interest", type: "TABLE", table: FY_GRID },
  { code: "C.P1.EI.6", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Provide details of any corrective action taken or underway on issues related to fines/penalties/action taken by regulators on cases of corruption and conflicts of interest", type: "TEXT" },
  { code: "C.P1.EI.7", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Number of internal controls in the entity's internal financial controls register", type: "NUMBER", unit: "controls", group: "Internal controls" },
  { code: "C.P1.EI.8", section: "C", principle: "P1", cls: "ESSENTIAL", label: "Percentage of key internal controls tested during the reporting period", type: "NUMBER", unit: "%", group: "Internal controls" },
  { code: "C.P1.LI.1", section: "C", principle: "P1", cls: "LEADERSHIP", label: "Awareness programmes conducted for value chain partners on any of the Principles", type: "TABLE", table: [{ key: "programmes", label: "Total number of awareness programmes held", type: "NUMBER" }, { key: "topics", label: "Topics/principles covered", type: "TEXT" }, { key: "coveragePct", label: "%age of value chain partners covered", type: "NUMBER" }], mandatory: false },
  { code: "C.P1.LI.2", section: "C", principle: "P1", cls: "LEADERSHIP", label: "Does the entity have processes in place to avoid/manage conflict of interests involving members of the Board?", type: "TEXT", mandatory: false },
];

// P2 — Sustainable and safe goods and services  (MANUAL ONLY)
const P2: Ind[] = [
  { code: "C.P2.EI.1", section: "C", principle: "P2", cls: "ESSENTIAL", label: "Percentage of R&D and capital expenditure investments in specific technologies to improve the environmental and social impacts of products and processes", type: "TABLE", table: [{ key: "category", label: "R&D / Capex", type: "TEXT" }, { key: "currentFy", label: "Current FY (%)", type: "NUMBER" }, { key: "previousFy", label: "Previous FY (%)", type: "NUMBER" }, { key: "details", label: "Details of improvements in environmental and social impacts", type: "TEXT" }] },
  { code: "C.P2.EI.2", section: "C", principle: "P2", cls: "ESSENTIAL", label: "Does the entity have procedures in place for sustainable sourcing? If yes, what percentage of inputs were sourced sustainably?", type: "TABLE", table: [{ key: "hasProcedure", label: "Procedures in place (Yes/No)", type: "TEXT" }, { key: "sustainablySourcedPct", label: "% of inputs sourced sustainably", type: "NUMBER" }] },
  { code: "C.P2.EI.3", section: "C", principle: "P2", cls: "ESSENTIAL", label: "Describe the processes in place to safely reclaim your products for reusing, recycling and disposing at the end of life", type: "TABLE", table: [{ key: "stream", label: "Plastics / E-waste / Hazardous waste / Other waste", type: "TEXT" }, { key: "process", label: "Description of process", type: "TEXT" }] },
  { code: "C.P2.EI.4", section: "C", principle: "P2", cls: "ESSENTIAL", label: "Whether Extended Producer Responsibility (EPR) is applicable to the entity's activities. If yes, whether the waste collection plan is in line with the EPR plan submitted to Pollution Control Boards", type: "TEXT" },
  { code: "C.P2.LI.1", section: "C", principle: "P2", cls: "LEADERSHIP", label: "Has the entity conducted Life Cycle Perspective/Assessments (LCA) for any of its products or for its services?", type: "TABLE", table: [{ key: "nic", label: "NIC Code", type: "TEXT" }, { key: "product", label: "Name of Product/Service", type: "TEXT" }, { key: "turnoverPct", label: "% of total Turnover contributed", type: "NUMBER" }, { key: "lcaBoundary", label: "Boundary for which the LCA was conducted", type: "TEXT" }, { key: "externalAgency", label: "Whether conducted by independent external agency (Yes/No)", type: "TEXT" }], mandatory: false },
  { code: "C.P2.LI.2", section: "C", principle: "P2", cls: "LEADERSHIP", label: "If there are any significant social or environmental concerns and/or risks arising from production or disposal of your products/services, as identified in the Life Cycle Perspective/Assessments, provide details of the same and action taken to mitigate them", type: "TABLE", table: [{ key: "product", label: "Name of Product/Service", type: "TEXT" }, { key: "concern", label: "Description of the risk/concern", type: "TEXT" }, { key: "action", label: "Action Taken", type: "TEXT" }], mandatory: false },
  { code: "C.P2.LI.3", section: "C", principle: "P2", cls: "LEADERSHIP", label: "Percentage of recycled or reused input material to total material (by value) used in production", type: "TABLE", table: [{ key: "material", label: "Indicate input material", type: "TEXT" }, { key: "currentFy", label: "Current FY (%)", type: "NUMBER" }, { key: "previousFy", label: "Previous FY (%)", type: "NUMBER" }], mandatory: false },
  { code: "C.P2.LI.4", section: "C", principle: "P2", cls: "LEADERSHIP", label: "Of the products and packaging reclaimed at end of life of products, amount (in metric tonnes) reused, recycled, and safely disposed", type: "TABLE", table: [{ key: "stream", label: "Plastics / E-waste / Hazardous waste / Other waste", type: "TEXT" }, { key: "reused", label: "Re-Used (MT)", type: "NUMBER" }, { key: "recycled", label: "Recycled (MT)", type: "NUMBER" }, { key: "safelyDisposed", label: "Safely Disposed (MT)", type: "NUMBER" }], mandatory: false },
  { code: "C.P2.LI.5", section: "C", principle: "P2", cls: "LEADERSHIP", label: "Reclaimed products and their packaging materials as a percentage of total products sold, for each product category", type: "TABLE", table: [{ key: "category", label: "Indicate product category", type: "TEXT" }, { key: "reclaimedPct", label: "Reclaimed products and their packaging materials as % of total products sold", type: "NUMBER" }], mandatory: false },
];

// P3 — Employee well-being
const P3: Ind[] = [
  { code: "C.P3.EI.1", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Details of measures for the well-being of employees — health insurance, accident insurance, maternity benefits, paternity benefits, day care facilities", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "totalA", label: "Total (A)", type: "NUMBER" }, { key: "healthInsurance", label: "Health insurance — No. (B)", type: "NUMBER" }, { key: "accidentInsurance", label: "Accident insurance — No. (C)", type: "NUMBER" }, { key: "maternityBenefits", label: "Maternity benefits — No. (D)", type: "NUMBER" }, { key: "paternityBenefits", label: "Paternity benefits — No. (E)", type: "NUMBER" }, { key: "dayCare", label: "Day Care facilities — No. (F)", type: "NUMBER" }] },
  { code: "C.P3.EI.2", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Details of measures for the well-being of workers", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "totalA", label: "Total (A)", type: "NUMBER" }, { key: "healthInsurance", label: "Health insurance — No. (B)", type: "NUMBER" }, { key: "accidentInsurance", label: "Accident insurance — No. (C)", type: "NUMBER" }] },
  { code: "C.P3.EI.3", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Details of retirement benefits — PF, Gratuity, ESI", type: "TABLE", table: [{ key: "benefit", label: "Benefits", type: "TEXT" }, { key: "employeesPct", label: "No. of employees covered as a % of total employees", type: "NUMBER" }, { key: "workersPct", label: "No. of workers covered as a % of total workers", type: "NUMBER" }, { key: "depositedWithAuthority", label: "Deducted and deposited with the authority (Y/N/N.A.)", type: "TEXT" }] },
  { code: "C.P3.EI.4", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Accessibility of workplaces — are the premises/offices of the entity accessible to differently abled employees and workers, as per the requirements of the Rights of Persons with Disabilities Act, 2016?", type: "TEXT" },
  { code: "C.P3.EI.5", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Does the entity have an equal opportunity policy as per the Rights of Persons with Disabilities Act, 2016?", type: "TEXT" },
  { code: "C.P3.EI.6", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Return to work and Retention rates of permanent employees and workers that took parental leave", type: "TABLE", table: [{ key: "category", label: "Gender", type: "TEXT" }, { key: "returnToWorkRate", label: "Return to work rate", type: "NUMBER" }, { key: "retentionRate", label: "Retention rate", type: "NUMBER" }] },
  { code: "C.P3.EI.7", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Is there a mechanism available to receive and redress grievances for employees and workers? If yes, give details of the mechanism in brief", type: "TEXT" },
  { code: "C.P3.EI.8", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Membership of employees and workers in association(s) or Unions recognised by the listed entity", type: "TABLE", table: GENDER_GRID },
  { code: "C.P3.EI.9", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Details of training given to employees and workers on health and safety measures and on skill upgradation", type: "NUMBER", unit: "%", group: "Health & safety training" },
  { code: "C.P3.EI.10", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Details of performance and career development reviews of employees and workers", type: "TABLE", table: GENDER_GRID },
  { code: "C.P3.EI.11", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Health and safety management system — whether an occupational health and safety management system has been implemented by the entity, and the coverage of such a system", type: "TEXT", group: "Occupational health & safety" },
  { code: "C.P3.EI.12", section: "C", principle: "P3", cls: "ESSENTIAL", label: "What are the processes used to identify work-related hazards and assess risks on a routine and non-routine basis by the entity?", type: "TEXT", group: "Occupational health & safety" },
  { code: "C.P3.EI.13", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Whether you have processes for workers to report the work-related hazards and to remove themselves from such risks", type: "TEXT", group: "Occupational health & safety" },
  { code: "C.P3.EI.14", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Lost Time Injury Frequency Rate (LTIFR) per one million person-hours worked", type: "NUMBER", unit: "per million person-hours", group: "Safety incident metrics" },
  { code: "C.P3.EI.15", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Total recordable work-related injuries", type: "NUMBER", unit: "count", group: "Safety incident metrics" },
  { code: "C.P3.EI.16", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Number of fatalities as a result of work-related injury or ill-health", type: "NUMBER", unit: "count", group: "Safety incident metrics" },
  { code: "C.P3.EI.17", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Number of man-days lost due to work-related injury or ill-health", type: "NUMBER", unit: "days", group: "Safety incident metrics" },
  { code: "C.P3.EI.18", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Total person-hours worked during the reporting period (employees and contractors)", type: "NUMBER", unit: "person-hours", group: "Safety incident metrics" },
  { code: "C.P3.EI.19", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Number of high-potential near-miss incidents reported during the reporting period", type: "NUMBER", unit: "count", group: "Safety incident metrics" },
  { code: "C.P3.EI.20", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Describe the measures taken by the entity to ensure a safe and healthy workplace", type: "TEXT" },
  { code: "C.P3.EI.21", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Number of Complaints on Working Conditions and Health & Safety filed, pending resolution and remarks", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "filed", label: "Filed during the year", type: "NUMBER" }, { key: "pending", label: "Pending resolution at the end of year", type: "NUMBER" }, { key: "remarks", label: "Remarks", type: "TEXT" }] },
  { code: "C.P3.EI.22", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Assessments for the year — percentage of plants and offices assessed for health and safety practices and working conditions", type: "TABLE", table: [{ key: "area", label: "Health and safety practices / Working Conditions", type: "TEXT" }, { key: "assessedPct", label: "% of plants and offices that were assessed", type: "NUMBER" }] },
  { code: "C.P3.EI.23", section: "C", principle: "P3", cls: "ESSENTIAL", label: "Provide details of any corrective action taken or underway to address safety-related incidents and on significant risks/concerns arising from assessments of health and safety practices and working conditions", type: "TEXT" },
  { code: "C.P3.LI.1", section: "C", principle: "P3", cls: "LEADERSHIP", label: "Does the entity extend any life insurance or any compensatory package in the event of death of employees and workers?", type: "TEXT", mandatory: false },
  { code: "C.P3.LI.2", section: "C", principle: "P3", cls: "LEADERSHIP", label: "Provide the measures undertaken by the entity to ensure that statutory dues have been deducted and deposited by the value chain partners", type: "TEXT", mandatory: false },
  { code: "C.P3.LI.3", section: "C", principle: "P3", cls: "LEADERSHIP", label: "Number of employees/workers having suffered high consequence work-related injury/ill-health/fatalities, who have been rehabilitated and placed in suitable employment or whose family members have been placed in suitable employment", type: "TABLE", table: FY_GRID, mandatory: false },
  { code: "C.P3.LI.4", section: "C", principle: "P3", cls: "LEADERSHIP", label: "Does the entity provide transition assistance programmes to facilitate continued employability and the management of career endings resulting from retirement or termination of employment?", type: "TEXT", mandatory: false },
  { code: "C.P3.LI.5", section: "C", principle: "P3", cls: "LEADERSHIP", label: "Details on assessment of value chain partners for health and safety practices and working conditions", type: "TABLE", table: [{ key: "area", label: "Health and safety practices / Working Conditions", type: "TEXT" }, { key: "assessedPct", label: "% of value chain partners that were assessed", type: "NUMBER" }], mandatory: false },
];

// P4 — Stakeholder responsiveness  (MANUAL ONLY)
const P4: Ind[] = [
  { code: "C.P4.EI.1", section: "C", principle: "P4", cls: "ESSENTIAL", label: "Describe the processes for identifying key stakeholder groups of the entity", type: "TEXT" },
  { code: "C.P4.EI.2", section: "C", principle: "P4", cls: "ESSENTIAL", label: "List stakeholder groups identified as key for your entity and the frequency of engagement with each stakeholder group", type: "TABLE", table: [{ key: "group", label: "Stakeholder Group", type: "TEXT" }, { key: "vulnerable", label: "Whether identified as Vulnerable & Marginalized Group (Yes/No)", type: "TEXT" }, { key: "channels", label: "Channels of communication", type: "TEXT" }, { key: "frequency", label: "Frequency of engagement", type: "TEXT" }, { key: "purpose", label: "Purpose and scope of engagement including key topics and concerns raised", type: "TEXT" }] },
  { code: "C.P4.LI.1", section: "C", principle: "P4", cls: "LEADERSHIP", label: "Provide the processes for consultation between stakeholders and the Board on economic, environmental and social topics", type: "TEXT", mandatory: false },
  { code: "C.P4.LI.2", section: "C", principle: "P4", cls: "LEADERSHIP", label: "Whether stakeholder consultation is used to support the identification and management of environmental and social topics", type: "TEXT", mandatory: false },
  { code: "C.P4.LI.3", section: "C", principle: "P4", cls: "LEADERSHIP", label: "Provide details of instances of engagement with, and actions taken to address the concerns of, vulnerable/marginalized stakeholder groups", type: "TEXT", mandatory: false },
];

// P5 — Human rights
const P5: Ind[] = [
  { code: "C.P5.EI.1", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Employees and workers who have been provided training on human rights issues and policy(ies) of the entity", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "totalA", label: "Total (A)", type: "NUMBER" }, { key: "coveredB", label: "No. of employees/workers covered (B)", type: "NUMBER" }, { key: "coveredPct", label: "% (B/A)", type: "NUMBER" }] },
  { code: "C.P5.EI.2", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Details of minimum wages paid to employees and workers", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "totalA", label: "Total (A)", type: "NUMBER" }, { key: "equalToMinimum", label: "Equal to Minimum Wage — No. (B)", type: "NUMBER" }, { key: "moreThanMinimum", label: "More than Minimum Wage — No. (C)", type: "NUMBER" }] },
  { code: "C.P5.EI.3", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Percentage of facilities assessed as compliant on statutory minimum wage payment", type: "NUMBER", unit: "%", group: "Social compliance" },
  { code: "C.P5.EI.4", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Percentage of facilities assessed as compliant on freedom of association and collective bargaining", type: "NUMBER", unit: "%", group: "Social compliance" },
  { code: "C.P5.EI.5", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Percentage of facilities assessed as compliant on prevention of forced or compulsory labour (no deposit or document retention)", type: "NUMBER", unit: "%", group: "Social compliance" },
  { code: "C.P5.EI.6", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Details of remuneration/salary/wages — median remuneration of Board of Directors, Key Managerial Personnel, Employees and Workers", type: "TABLE", table: GENDER_GRID },
  { code: "C.P5.EI.7", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Do you have a focal point (Individual/Committee) responsible for addressing human rights impacts or issues caused or contributed to by the business?", type: "TEXT" },
  { code: "C.P5.EI.8", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Describe the internal mechanisms in place to redress grievances related to human rights issues", type: "TEXT" },
  { code: "C.P5.EI.9", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Number of complaints on Sexual Harassment, Discrimination at workplace, Child Labour, Forced Labour, Wages and Other human rights related issues", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "filed", label: "Filed during the year", type: "NUMBER" }, { key: "pending", label: "Pending resolution at the end of year", type: "NUMBER" }, { key: "remarks", label: "Remarks", type: "TEXT" }] },
  { code: "C.P5.EI.10", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Mechanisms to prevent adverse consequences to the complainant in discrimination and harassment cases", type: "TEXT" },
  { code: "C.P5.EI.11", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Do human rights requirements form part of your business agreements and contracts?", type: "TEXT" },
  { code: "C.P5.EI.12", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Total number of contractor workers engaged across the entity's sites during the reporting period", type: "NUMBER", unit: "persons", group: "Value chain workforce" },
  { code: "C.P5.EI.13", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Assessments for the year — percentage of plants and offices assessed for child labour, forced/involuntary labour, sexual harassment, discrimination at workplace and wages", type: "TABLE", table: [{ key: "area", label: "Assessment area", type: "TEXT" }, { key: "assessedPct", label: "% of plants and offices that were assessed", type: "NUMBER" }] },
  { code: "C.P5.EI.14", section: "C", principle: "P5", cls: "ESSENTIAL", label: "Provide details of any corrective actions taken or underway to address significant risks/concerns arising from the assessments above", type: "TEXT" },
  { code: "C.P5.LI.1", section: "C", principle: "P5", cls: "LEADERSHIP", label: "Details of a business process being modified/introduced as a result of addressing human rights grievances/complaints", type: "TEXT", mandatory: false },
  { code: "C.P5.LI.2", section: "C", principle: "P5", cls: "LEADERSHIP", label: "Details of the scope and coverage of any Human rights due diligence conducted", type: "TEXT", mandatory: false },
  { code: "C.P5.LI.3", section: "C", principle: "P5", cls: "LEADERSHIP", label: "Is the premise/office of the entity accessible to differently abled visitors, as per the requirements of the Rights of Persons with Disabilities Act, 2016?", type: "TEXT", mandatory: false },
  { code: "C.P5.LI.4", section: "C", principle: "P5", cls: "LEADERSHIP", label: "Details on assessment of value chain partners for sexual harassment, discrimination at workplace, child labour, forced/involuntary labour, wages and others", type: "TABLE", table: [{ key: "area", label: "Assessment area", type: "TEXT" }, { key: "assessedPct", label: "% of value chain partners that were assessed", type: "NUMBER" }], mandatory: false },
];

// P6 — Environment
const P6: Ind[] = [
  { code: "C.P6.EI.1", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total energy consumption from renewable sources", type: "NUMBER", unit: "GJ", group: "Energy consumption and intensity" },
  { code: "C.P6.EI.2", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total energy consumption from non-renewable sources", type: "NUMBER", unit: "GJ", group: "Energy consumption and intensity" },
  { code: "C.P6.EI.3", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total energy consumed", type: "NUMBER", unit: "GJ", group: "Energy consumption and intensity" },
  { code: "C.P6.EI.4", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Energy intensity per rupee of turnover", type: "NUMBER", unit: "GJ per INR of turnover", group: "Energy consumption and intensity" },
  { code: "C.P6.EI.5", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Does the entity have any sites/facilities identified as designated consumers (DCs) under the Performance, Achieve and Trade (PAT) Scheme of the Government of India? If yes, disclose whether targets set under the PAT scheme have been achieved", type: "TEXT" },
  { code: "C.P6.EI.6", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total water withdrawal by source", type: "NUMBER", unit: "kL", group: "Water" },
  { code: "C.P6.EI.7", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total volume of water consumption", type: "NUMBER", unit: "kL", group: "Water" },
  { code: "C.P6.EI.8", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Water intensity per rupee of turnover", type: "NUMBER", unit: "kL per INR of turnover", group: "Water" },
  { code: "C.P6.EI.9", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total volume of water discharged by destination and level of treatment", type: "NUMBER", unit: "kL", group: "Water" },
  { code: "C.P6.EI.10", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Has the entity implemented a mechanism for Zero Liquid Discharge? If yes, provide details of its coverage and implementation", type: "TEXT", group: "Water" },
  { code: "C.P6.EI.11", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Please provide details of air emissions (other than GHG emissions) by the entity — NOx, SOx, Particulate matter, POP, VOC, HAP", type: "TABLE", table: [{ key: "parameter", label: "Parameter", type: "TEXT" }, { key: "unit", label: "Please specify unit", type: "TEXT" }, { key: "currentFy", label: "Current FY", type: "NUMBER" }, { key: "previousFy", label: "Previous FY", type: "NUMBER" }], group: "Air emissions" },
  { code: "C.P6.EI.12", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total Scope 1 emissions", type: "NUMBER", unit: "tCO2e", group: "Greenhouse gas emissions" },
  { code: "C.P6.EI.13", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total Scope 2 emissions", type: "NUMBER", unit: "tCO2e", group: "Greenhouse gas emissions" },
  { code: "C.P6.EI.14", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total Scope 1 and Scope 2 emission intensity per rupee of turnover", type: "NUMBER", unit: "tCO2e per INR of turnover", group: "Greenhouse gas emissions" },
  { code: "C.P6.EI.15", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Does the entity have any project related to reducing Greenhouse Gas emission? If yes, then provide details", type: "TEXT", group: "Greenhouse gas emissions" },
  { code: "C.P6.EI.16", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total waste generated (break-up by category)", type: "NUMBER", unit: "MT", group: "Waste management" },
  { code: "C.P6.EI.17", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total waste recovered through recycling, re-using or other recovery operations", type: "NUMBER", unit: "MT", group: "Waste management" },
  { code: "C.P6.EI.18", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Total waste disposed by incineration, landfilling or other disposal operations", type: "NUMBER", unit: "MT", group: "Waste management" },
  { code: "C.P6.EI.19", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Briefly describe the waste management practices adopted in your establishments, and the strategy adopted by your company to reduce usage of hazardous and toxic chemicals", type: "TEXT", group: "Waste management" },
  { code: "C.P6.EI.20", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Details of any environmental incidents (spills, releases, statutory exceedances) recorded during the reporting period", type: "NUMBER", unit: "count", group: "Environmental compliance" },
  { code: "C.P6.EI.21", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Please provide details of any air emissions, effluent discharges or waste disposal in areas identified as ecologically sensitive", type: "TEXT", group: "Environmental compliance" },
  { code: "C.P6.EI.22", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Details of environmental impact assessments of projects undertaken by the entity based on applicable laws, in the current financial year", type: "TABLE", table: [{ key: "projectName", label: "Name and brief details of project", type: "TEXT" }, { key: "eiaNotification", label: "EIA Notification No.", type: "TEXT" }, { key: "date", label: "Date", type: "TEXT" }, { key: "externalAgency", label: "Whether conducted by independent external agency (Yes/No)", type: "TEXT" }, { key: "publicDomain", label: "Results communicated in public domain (Yes/No)", type: "TEXT" }, { key: "webLink", label: "Relevant Web link", type: "TEXT" }], group: "Environmental compliance" },
  { code: "C.P6.EI.23", section: "C", principle: "P6", cls: "ESSENTIAL", label: "Is the entity compliant with the applicable environmental law/regulations/guidelines in India, such as the Water (Prevention and Control of Pollution) Act, Air (Prevention and Control of Pollution) Act, Environment protection act and rules thereunder?", type: "TEXT", group: "Environmental compliance" },
  { code: "C.P6.LI.1", section: "C", principle: "P6", cls: "LEADERSHIP", label: "Water withdrawal, consumption and discharge in areas of water stress", type: "TABLE", table: FY_GRID, mandatory: false },
  { code: "C.P6.LI.2", section: "C", principle: "P6", cls: "LEADERSHIP", label: "Total Scope 3 emissions", type: "NUMBER", unit: "tCO2e", mandatory: false },
  { code: "C.P6.LI.3", section: "C", principle: "P6", cls: "LEADERSHIP", label: "With respect to the ecologically sensitive areas reported above, provide details of significant direct and indirect impact of the entity on biodiversity and prevention and remediation activities", type: "TEXT", mandatory: false },
  { code: "C.P6.LI.4", section: "C", principle: "P6", cls: "LEADERSHIP", label: "If the entity has undertaken any specific initiatives or used innovative technology or solutions to improve resource efficiency, or reduce impact due to emissions/effluent discharge/waste generated, please provide details", type: "TEXT", mandatory: false },
  { code: "C.P6.LI.5", section: "C", principle: "P6", cls: "LEADERSHIP", label: "Does the entity have a business continuity and disaster management plan? Give details in 100 words/web link", type: "TEXT", mandatory: false },
  { code: "C.P6.LI.6", section: "C", principle: "P6", cls: "LEADERSHIP", label: "Disclose any significant adverse impact to the environment, arising from the value chain of the entity. What mitigation or adaptation measures have been taken by the entity in this regard?", type: "TEXT", mandatory: false },
  { code: "C.P6.LI.7", section: "C", principle: "P6", cls: "LEADERSHIP", label: "Percentage of value chain partners (by value of business done with such partners) that were assessed for environmental impacts", type: "NUMBER", unit: "%", mandatory: false },
];

// P7 — Public policy advocacy  (MANUAL ONLY)
const P7: Ind[] = [
  { code: "C.P7.EI.1", section: "C", principle: "P7", cls: "ESSENTIAL", label: "Number of affiliations with trade and industry chambers/associations", type: "NUMBER", unit: "count" },
  { code: "C.P7.EI.2", section: "C", principle: "P7", cls: "ESSENTIAL", label: "List the top 10 trade and industry chambers/associations (determined based on the total members of such body) the entity is a member of/affiliated to", type: "TABLE", table: [{ key: "name", label: "Name of the trade and industry chambers/associations", type: "TEXT" }, { key: "reach", label: "Reach of trade and industry chambers/associations (State/National)", type: "TEXT" }] },
  { code: "C.P7.EI.3", section: "C", principle: "P7", cls: "ESSENTIAL", label: "Provide details of corrective action taken or underway on any issues related to anti-competitive conduct by the entity, based on adverse orders from regulatory authorities", type: "TABLE", table: [{ key: "authority", label: "Name of authority", type: "TEXT" }, { key: "brief", label: "Brief of the case", type: "TEXT" }, { key: "correctiveAction", label: "Corrective action taken", type: "TEXT" }] },
  { code: "C.P7.LI.1", section: "C", principle: "P7", cls: "LEADERSHIP", label: "Details of public policy positions advocated by the entity", type: "TABLE", table: [{ key: "policyAdvocated", label: "Public policy advocated", type: "TEXT" }, { key: "method", label: "Method resorted for such advocacy", type: "TEXT" }, { key: "publicDomain", label: "Whether information available in public domain (Yes/No)", type: "TEXT" }, { key: "frequency", label: "Frequency of Review by Board", type: "TEXT" }, { key: "webLink", label: "Web Link, if available", type: "TEXT" }], mandatory: false },
];

// P8 — Inclusive growth  (MANUAL ONLY)
const P8: Ind[] = [
  { code: "C.P8.EI.1", section: "C", principle: "P8", cls: "ESSENTIAL", label: "Details of Social Impact Assessments (SIA) of projects undertaken by the entity based on applicable laws, in the current financial year", type: "TABLE", table: [{ key: "projectName", label: "Name and brief details of project", type: "TEXT" }, { key: "siaNotification", label: "SIA Notification No.", type: "TEXT" }, { key: "date", label: "Date of notification", type: "TEXT" }, { key: "externalAgency", label: "Whether conducted by independent external agency (Yes/No)", type: "TEXT" }, { key: "publicDomain", label: "Results communicated in public domain (Yes/No)", type: "TEXT" }, { key: "webLink", label: "Relevant Web link", type: "TEXT" }] },
  { code: "C.P8.EI.2", section: "C", principle: "P8", cls: "ESSENTIAL", label: "Provide information on project(s) for which ongoing Rehabilitation and Resettlement (R&R) is being undertaken by your entity", type: "TABLE", table: [{ key: "projectName", label: "Name of Project for which R&R is ongoing", type: "TEXT" }, { key: "state", label: "State", type: "TEXT" }, { key: "district", label: "District", type: "TEXT" }, { key: "pafs", label: "No. of Project Affected Families (PAFs)", type: "NUMBER" }, { key: "pafsCovered", label: "% of PAFs covered by R&R", type: "NUMBER" }, { key: "amountPaid", label: "Amounts paid to PAFs in the FY (In INR)", type: "NUMBER" }] },
  { code: "C.P8.EI.3", section: "C", principle: "P8", cls: "ESSENTIAL", label: "Describe the mechanisms to receive and redress grievances of the community", type: "TEXT" },
  { code: "C.P8.EI.4", section: "C", principle: "P8", cls: "ESSENTIAL", label: "Percentage of input material (inputs to total inputs by value) sourced from suppliers — directly sourced from MSMEs/small producers, and sourced directly from within India", type: "TABLE", table: [{ key: "source", label: "Source", type: "TEXT" }, { key: "currentFy", label: "Current FY (%)", type: "NUMBER" }, { key: "previousFy", label: "Previous FY (%)", type: "NUMBER" }] },
  { code: "C.P8.EI.5", section: "C", principle: "P8", cls: "ESSENTIAL", label: "Job creation in smaller towns — wages paid to persons employed (including employees or workers employed on a permanent or non-permanent/on contract basis) in the following locations, as % of total wage cost", type: "TABLE", table: [{ key: "location", label: "Rural / Semi-urban / Urban / Metropolitan", type: "TEXT" }, { key: "currentFy", label: "Current FY (%)", type: "NUMBER" }, { key: "previousFy", label: "Previous FY (%)", type: "NUMBER" }] },
  { code: "C.P8.LI.1", section: "C", principle: "P8", cls: "LEADERSHIP", label: "Provide details of actions taken to mitigate any negative social impacts identified in the Social Impact Assessments", type: "TABLE", table: [{ key: "negativeImpact", label: "Details of negative social impact identified", type: "TEXT" }, { key: "correctiveAction", label: "Corrective action taken", type: "TEXT" }], mandatory: false },
  { code: "C.P8.LI.2", section: "C", principle: "P8", cls: "LEADERSHIP", label: "Provide the following information on CSR projects undertaken by your entity in designated aspirational districts as identified by government bodies", type: "TABLE", table: [{ key: "state", label: "State", type: "TEXT" }, { key: "aspirationalDistrict", label: "Aspirational District", type: "TEXT" }, { key: "amountSpent", label: "Amount spent (In INR)", type: "NUMBER" }], mandatory: false },
  { code: "C.P8.LI.3", section: "C", principle: "P8", cls: "LEADERSHIP", label: "Do you have a preferential procurement policy where you give preference to purchase from suppliers comprising marginalized/vulnerable groups?", type: "TEXT", mandatory: false },
  { code: "C.P8.LI.4", section: "C", principle: "P8", cls: "LEADERSHIP", label: "Details of the benefits derived and shared from the intellectual properties owned or acquired by your entity (in the current financial year), based on traditional knowledge", type: "TABLE", table: [{ key: "ip", label: "Intellectual Property based on traditional knowledge", type: "TEXT" }, { key: "owned", label: "Owned/Acquired (Yes/No)", type: "TEXT" }, { key: "benefitShared", label: "Benefit shared (Yes/No)", type: "TEXT" }, { key: "basis", label: "Basis of calculating benefit share", type: "TEXT" }], mandatory: false },
  { code: "C.P8.LI.5", section: "C", principle: "P8", cls: "LEADERSHIP", label: "Details of corrective actions taken or underway, based on any adverse order in intellectual property related disputes wherein usage of traditional knowledge is involved", type: "TEXT", mandatory: false },
  { code: "C.P8.LI.6", section: "C", principle: "P8", cls: "LEADERSHIP", label: "Details of beneficiaries of CSR Projects", type: "TABLE", table: [{ key: "project", label: "CSR Project", type: "TEXT" }, { key: "beneficiaries", label: "No. of persons benefitted from CSR Projects", type: "NUMBER" }, { key: "vulnerablePct", label: "% of beneficiaries from vulnerable and marginalized groups", type: "NUMBER" }], mandatory: false },
];

// P9 — Consumer value
const P9: Ind[] = [
  { code: "C.P9.EI.1", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Describe the mechanisms in place to receive and respond to consumer complaints and feedback", type: "TEXT" },
  { code: "C.P9.EI.2", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Turnover of products and/or services as a percentage of turnover from all products/services that carry information about environmental and social parameters relevant to the product, safe and responsible usage, and recycling and/or safe disposal", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "turnoverPct", label: "As a percentage to total turnover", type: "NUMBER" }] },
  { code: "C.P9.EI.3", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Number of consumer complaints in respect of data privacy, advertising, cyber-security, delivery of essential services, restrictive trade practices, unfair trade practices and other", type: "TABLE", table: [{ key: "category", label: "Category", type: "TEXT" }, { key: "receivedCurrentFy", label: "Received during the year (Current FY)", type: "NUMBER" }, { key: "pendingCurrentFy", label: "Pending resolution at end of year (Current FY)", type: "NUMBER" }, { key: "remarks", label: "Remarks", type: "TEXT" }] },
  { code: "C.P9.EI.4", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Details of instances of product recalls on account of safety issues", type: "TABLE", table: [{ key: "type", label: "Voluntary recalls / Forced recalls", type: "TEXT" }, { key: "number", label: "Number", type: "NUMBER" }, { key: "reason", label: "Reasons for recall", type: "TEXT" }] },
  { code: "C.P9.EI.5", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Does the entity have a framework/policy on cyber security and risks related to data privacy? If available, provide a web-link of the policy", type: "TEXT" },
  { code: "C.P9.EI.6", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Provide details of any corrective actions taken or underway on issues relating to advertising, and delivery of essential services; cyber security and data privacy of customers; re-occurrence of instances of product recalls; penalty/action taken by regulatory authorities on safety of products/services", type: "TEXT" },
  { code: "C.P9.EI.7", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Percentage of value chain partners assessed for ESG risk during the reporting period", type: "NUMBER", unit: "%", group: "Value chain ESG risk" },
  { code: "C.P9.EI.8", section: "C", principle: "P9", cls: "ESSENTIAL", label: "Percentage of value chain partners carrying a current risk assessment in the entity's vendor risk register", type: "NUMBER", unit: "%", group: "Value chain ESG risk" },
  { code: "C.P9.LI.1", section: "C", principle: "P9", cls: "LEADERSHIP", label: "Channels/platforms where information on products and services of the entity can be accessed (provide web link, if available)", type: "TEXT", mandatory: false },
  { code: "C.P9.LI.2", section: "C", principle: "P9", cls: "LEADERSHIP", label: "Steps taken to inform and educate consumers about safe and responsible usage of products and/or services", type: "TEXT", mandatory: false },
  { code: "C.P9.LI.3", section: "C", principle: "P9", cls: "LEADERSHIP", label: "Mechanisms in place to inform consumers of any risk of disruption/discontinuation of essential services", type: "TEXT", mandatory: false },
  { code: "C.P9.LI.4", section: "C", principle: "P9", cls: "LEADERSHIP", label: "Does the entity display product information on the product over and above what is mandated as per local laws? Did your entity carry out any survey with regard to consumer satisfaction relating to the major products/services of the entity, significant locations of operation of the entity or the entity as a whole?", type: "TEXT", mandatory: false },
  { code: "C.P9.LI.5", section: "C", principle: "P9", cls: "LEADERSHIP", label: "Provide the following information relating to data breaches — number of instances, percentage involving personally identifiable information of customers, and impact", type: "TEXT", mandatory: false },
];

const ALL_INDICATORS: Ind[] = [
  ...SECTION_A, ...SECTION_B,
  ...P1, ...P2, ...P3, ...P4, ...P5, ...P6, ...P7, ...P8, ...P9,
];

// ── Data-source mappings (P1, P3, P5, P6, P9) ───────────────────────────────
// P2/P4/P7/P8 deliberately have NO rows: they are manual-entry only, and the
// UI reads that from PLATFORM_SOURCED_PRINCIPLES, not from "we found nothing".
type Src = {
  indicatorCode: string;
  sourceModule: string;
  sourceEntity: string;
  sourceField?: string;
  resolverKey: string;
  args?: Record<string, unknown>;
  note: string;
  isPrimary?: boolean;
};

const DATA_SOURCES: Src[] = [
  // ── P1 — ERM internal controls ──
  { indicatorCode: "C.P1.EI.7", sourceModule: "ERM", sourceEntity: "Control", resolverKey: "erm.control_count", args: { keyControlsOnly: false }, note: "Count of active, non-deleted rows in the ERM internal-controls register." },
  { indicatorCode: "C.P1.EI.8", sourceModule: "ERM", sourceEntity: "ControlTest", resolverKey: "erm.control_test_coverage", note: "Distinct active controls with at least one ControlTest recorded inside the reporting period, as a percentage of all active controls." },

  // ── P3 — Manhours / Incident / NearMiss / Training / Facilities ──
  { indicatorCode: "C.P3.EI.9", sourceModule: "TRAINING", sourceEntity: "TrainingAssignment", resolverKey: "training.coverage", note: "Training assignments completed as a percentage of assignments raised in the reporting period." },
  { indicatorCode: "C.P3.EI.14", sourceModule: "MANHOURS", sourceEntity: "Manhours", sourceField: "ltifr", resolverKey: "manhours.safety_metric", args: { metric: "ltifr" }, note: "(Lost-time injuries ÷ total person-hours) × 1,000,000, summed across the monthly Manhours records in the period. Includes contractor hours." },
  { indicatorCode: "C.P3.EI.15", sourceModule: "MANHOURS", sourceEntity: "Manhours", resolverKey: "manhours.safety_metric", args: { metric: "recordable_injuries" }, note: "Lost-time + medical-treatment + fatal cases from the monthly Manhours records." },
  { indicatorCode: "C.P3.EI.16", sourceModule: "MANHOURS", sourceEntity: "Manhours", sourceField: "fatalCount", resolverKey: "manhours.safety_metric", args: { metric: "fatalities" }, note: "Fatal cases from the monthly Manhours records in the period." },
  { indicatorCode: "C.P3.EI.17", sourceModule: "MANHOURS", sourceEntity: "Manhours", sourceField: "lostDays", resolverKey: "manhours.safety_metric", args: { metric: "lost_days" }, note: "Days lost to injury, summed across the monthly Manhours records." },
  { indicatorCode: "C.P3.EI.18", sourceModule: "MANHOURS", sourceEntity: "Manhours", resolverKey: "manhours.safety_metric", args: { metric: "manhours_worked" }, note: "Employee + contractor person-hours worked in the reporting period." },
  { indicatorCode: "C.P3.EI.19", sourceModule: "NEAR_MISS", sourceEntity: "NearMiss", resolverKey: "near_miss.count", note: "Near-miss reports raised inside the reporting period." },

  // ── P5 — EPC contractors + SA8000 social compliance ──
  { indicatorCode: "C.P5.EI.3", sourceModule: "FACILITIES", sourceEntity: "SocialComplianceProfile", sourceField: "minimumWageCompliant", resolverKey: "facilities.social_compliance", args: { field: "minimumWageCompliant" }, note: "Facilities assessed COMPLIANT on statutory minimum wage, as a percentage of facilities assessed. Unassessed facilities are excluded from the denominator." },
  { indicatorCode: "C.P5.EI.4", sourceModule: "FACILITIES", sourceEntity: "SocialComplianceProfile", sourceField: "unionOrWorkerCommitteePresent", resolverKey: "facilities.social_compliance", args: { field: "unionOrWorkerCommitteePresent" }, note: "Facilities assessed COMPLIANT on freedom of association, as a percentage of facilities assessed." },
  { indicatorCode: "C.P5.EI.5", sourceModule: "FACILITIES", sourceEntity: "SocialComplianceProfile", sourceField: "noDepositOrDocumentRetention", resolverKey: "facilities.social_compliance", args: { field: "noDepositOrDocumentRetention" }, note: "Facilities assessed COMPLIANT on prevention of forced labour, as a percentage of facilities assessed." },
  { indicatorCode: "C.P5.EI.12", sourceModule: "EPC", sourceEntity: "ContractorWorker", resolverKey: "epc.contractor_workforce", note: "Contractor workers on the roster, excluding EXITED / TERMINATED / BLACKLISTED." },

  // ── P6 — BRSR environmental capture (primary) + Incident (secondary) ──
  { indicatorCode: "C.P6.EI.1", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "energy_renewable" }, note: "Sum of renewable-carrier energy lines across SUBMITTED/VERIFIED facility submissions." },
  { indicatorCode: "C.P6.EI.2", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "energy_non_renewable" }, note: "Sum of non-renewable-carrier energy lines across SUBMITTED/VERIFIED facility submissions." },
  { indicatorCode: "C.P6.EI.3", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "energy_total" }, note: "Renewable + non-renewable energy across SUBMITTED/VERIFIED facility submissions." },
  { indicatorCode: "C.P6.EI.4", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvironmentalMetric", resolverKey: "brsr_env.intensity", args: { metric: "energy" }, note: "Total energy ÷ summed turnover. Omitted entirely when no facility reports turnover." },
  { indicatorCode: "C.P6.EI.6", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "water_withdrawn" }, note: "Sum of water WITHDRAWAL lines across all sources." },
  { indicatorCode: "C.P6.EI.7", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "water_consumed" }, note: "Sum of the water CONSUMPTION lines." },
  { indicatorCode: "C.P6.EI.8", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvironmentalMetric", resolverKey: "brsr_env.intensity", args: { metric: "water" }, note: "Water consumed ÷ summed turnover." },
  { indicatorCode: "C.P6.EI.9", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "water_discharged" }, note: "Sum of water DISCHARGE lines across all destinations." },
  { indicatorCode: "C.P6.EI.12", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "scope1" }, note: "Sum of computed Scope 1 emissions — activity quantity × the emission factor frozen onto each line. Unresolved lines are excluded and flagged." },
  { indicatorCode: "C.P6.EI.13", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "scope2" }, note: "Sum of computed Scope 2 emissions — grid electricity × the CEA grid factor frozen onto each line." },
  { indicatorCode: "C.P6.EI.14", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvironmentalMetric", resolverKey: "brsr_env.intensity", args: { metric: "scope1_2" }, note: "(Scope 1 + Scope 2) ÷ summed turnover." },
  { indicatorCode: "C.P6.EI.16", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "waste_generated" }, note: "Sum of waste GENERATED lines across the eight BRSR waste categories." },
  { indicatorCode: "C.P6.EI.17", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "waste_recovered" }, note: "Sum of the recycled, re-used and other-recovery waste lines." },
  { indicatorCode: "C.P6.EI.18", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvMetricLine", resolverKey: "brsr_env.total", args: { metric: "waste_disposed" }, note: "Sum of the incinerated, landfilled and other-disposal waste lines." },
  { indicatorCode: "C.P6.EI.20", sourceModule: "INCIDENT", sourceEntity: "Incident", resolverKey: "incident.environmental", note: "Incidents classified ENVIRONMENTAL with an occurrence date inside the reporting period. Secondary source: evidences environmental compliance, it does not derive a resource figure.", isPrimary: false },
  { indicatorCode: "C.P6.LI.2", sourceModule: "BRSR_ENV", sourceEntity: "BrsrEnvironmentalMetric", sourceField: "scope3TCo2e", resolverKey: "brsr_env.total", args: { metric: "scope3" }, note: "Sum of the manually entered per-facility Scope 3 figures. No calculation engine is applied — Scope 3 computation is out of scope for this build." },

  // ── P9 — ERM vendor / ESG risk ──
  { indicatorCode: "C.P9.EI.7", sourceModule: "ERM", sourceEntity: "VendorAssessment", resolverKey: "erm.vendor_assessment_coverage", args: { lens: "ESG" }, note: "Active vendors holding a current ESG-lens assessment, as a percentage of all active vendors in the ERM vendor register." },
  { indicatorCode: "C.P9.EI.8", sourceModule: "ERM", sourceEntity: "VendorAssessment", resolverKey: "erm.vendor_assessment_coverage", args: { lens: "RISK" }, note: "Active vendors holding a current RISK-lens assessment, as a percentage of all active vendors." },
];

// ── Emission factors ────────────────────────────────────────────────────────
// ⚠ Values transcribed at build time; sources cited but NOT verified. See the
// header warning.
type Fac = {
  code: string; name: string; factorType: string; scope: "SCOPE_1" | "SCOPE_2";
  factorValue: number; perUnit: string; source: string; sourceYear?: string; notes?: string;
};

const FACTORS: Fac[] = [
  { code: "GRID_ELECTRICITY", name: "Indian grid electricity (all-India average)", factorType: "ELECTRICITY_GRID", scope: "SCOPE_2", factorValue: 0.000716, perUnit: "kWh", source: "CEA CO2 Baseline Database for the Indian Power Sector", sourceYear: "v20" },
  { code: "DIESEL", name: "Diesel (HSD)", factorType: "LIQUID_FUEL", scope: "SCOPE_1", factorValue: 0.00268, perUnit: "litre", source: "IPCC 2006 Guidelines / DEFRA GHG conversion factors", sourceYear: "2023" },
  { code: "PETROL", name: "Petrol (Motor spirit)", factorType: "LIQUID_FUEL", scope: "SCOPE_1", factorValue: 0.00231, perUnit: "litre", source: "IPCC 2006 Guidelines / DEFRA GHG conversion factors", sourceYear: "2023" },
  { code: "FURNACE_OIL", name: "Furnace oil", factorType: "LIQUID_FUEL", scope: "SCOPE_1", factorValue: 0.00315, perUnit: "litre", source: "IPCC 2006 Guidelines", sourceYear: "2006" },
  { code: "LPG", name: "Liquefied Petroleum Gas", factorType: "GASEOUS_FUEL", scope: "SCOPE_1", factorValue: 0.00298, perUnit: "kg", source: "IPCC 2006 Guidelines / DEFRA GHG conversion factors", sourceYear: "2023" },
  { code: "NATURAL_GAS", name: "Natural gas / PNG", factorType: "GASEOUS_FUEL", scope: "SCOPE_1", factorValue: 0.00193, perUnit: "scm", source: "IPCC 2006 Guidelines", sourceYear: "2006" },
  { code: "COAL", name: "Indian non-coking coal", factorType: "SOLID_FUEL", scope: "SCOPE_1", factorValue: 1.42, perUnit: "tonne", source: "IPCC 2006 Guidelines, adjusted for typical Indian coal calorific value", sourceYear: "2006", notes: "HIGHLY sensitive to the calorific value of the coal actually burnt. Replace with a grade-specific factor before filing. " + FACTOR_WARNING },
  { code: "BIOMASS", name: "Biomass / agri-residue briquettes", factorType: "SOLID_FUEL", scope: "SCOPE_1", factorValue: 0, perUnit: "tonne", source: "IPCC 2006 Guidelines — biogenic CO2 reported separately from Scope 1", sourceYear: "2006", notes: "Biogenic CO2 is conventionally reported OUTSIDE the Scope 1 total, hence 0 here. Non-CO2 combustion emissions (CH4, N2O) are NOT captured by this factor. " + FACTOR_WARNING },
  { code: "REFRIGERANT_R22", name: "Refrigerant R22 (HCFC-22)", factorType: "REFRIGERANT", scope: "SCOPE_1", factorValue: 1.81, perUnit: "kg", source: "IPCC AR5 100-year GWP", sourceYear: "AR5" },
  { code: "REFRIGERANT_R410A", name: "Refrigerant R410A", factorType: "REFRIGERANT", scope: "SCOPE_1", factorValue: 2.088, perUnit: "kg", source: "IPCC AR5 100-year GWP", sourceYear: "AR5" },
];

async function main() {
  console.log("Seeding BRSR Reporting…\n");

  // 1. Indicators
  let order = 0;
  for (const ind of ALL_INDICATORS) {
    order += 10;
    const data = {
      section: ind.section,
      principle: ind.principle ?? null,
      indicatorClass: ind.cls ?? null,
      label: ind.label,
      groupLabel: ind.group ?? null,
      guidance: ind.guidance ?? null,
      valueType: ind.type ?? "TEXT",
      unit: ind.unit ?? null,
      tableSchemaJson: ind.table ?? undefined,
      isMandatory: ind.mandatory ?? true,
      displayOrder: order,
      isActive: true,
      sebiFormatVersion: FORMAT_VERSION,
    };
    await prisma.brsrIndicator.upsert({
      where: { code: ind.code },
      create: { code: ind.code, ...data },
      update: data,
    });
  }
  console.log(`  ✓ ${ALL_INDICATORS.length} indicators`);

  // 2. Data sources — every one must point at an indicator that exists, or the
  //    mapping is dead config that makes an unsourced indicator look sourced.
  const codes = new Set(ALL_INDICATORS.map((i) => i.code));
  const orphans = DATA_SOURCES.filter((s) => !codes.has(s.indicatorCode));
  if (orphans.length) {
    throw new Error(
      `Data sources reference unknown indicator codes: ${orphans.map((o) => o.indicatorCode).join(", ")}`
    );
  }

  for (const src of DATA_SOURCES) {
    const data = {
      sourceModule: src.sourceModule,
      sourceEntity: src.sourceEntity,
      sourceField: src.sourceField ?? null,
      // Prisma's JSON input type is InputJsonValue, not a bare index signature.
      resolverArgsJson: (src.args ?? undefined) as Prisma.InputJsonValue | undefined,
      derivationNote: src.note,
      isPrimary: src.isPrimary ?? true,
      isActive: true,
    };
    await prisma.brsrDataSource.upsert({
      where: {
        uq_BrsrDataSource_ind_resolver: {
          indicatorCode: src.indicatorCode,
          resolverKey: src.resolverKey,
        },
      },
      create: { indicatorCode: src.indicatorCode, resolverKey: src.resolverKey, ...data },
      update: data,
    });
  }
  console.log(`  ✓ ${DATA_SOURCES.length} data-source mappings`);

  // 3. Emission factors
  for (const f of FACTORS) {
    const data = {
      name: f.name,
      factorType: f.factorType,
      scope: f.scope,
      factorValue: f.factorValue,
      perUnit: f.perUnit,
      source: f.source,
      sourceYear: f.sourceYear ?? null,
      region: null,
      isActive: true,
      notes: f.notes ?? FACTOR_WARNING,
    };
    const existing = await prisma.brsrEmissionFactor.findFirst({ where: { code: f.code, region: null } });
    if (existing) {
      await prisma.brsrEmissionFactor.update({ where: { id: existing.id }, data });
    } else {
      await prisma.brsrEmissionFactor.create({ data: { code: f.code, ...data } });
    }
  }
  console.log(`  ✓ ${FACTORS.length} emission factors`);

  // ── Assertions ──
  const byPrinciple: Record<string, number> = {};
  for (const i of ALL_INDICATORS) if (i.principle) byPrinciple[i.principle] = (byPrinciple[i.principle] ?? 0) + 1;
  const sourced = new Set(DATA_SOURCES.map((s) => ALL_INDICATORS.find((i) => i.code === s.indicatorCode)?.principle));
  const manualOnly = ["P2", "P4", "P7", "P8"];
  const leak = manualOnly.filter((p) => sourced.has(p));
  if (leak.length) {
    throw new Error(`Manual-only principles must have no data sources, but found some for: ${leak.join(", ")}`);
  }

  console.log("\n  Indicators per principle:");
  for (const p of ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]) {
    const n = DATA_SOURCES.filter((s) => ALL_INDICATORS.find((i) => i.code === s.indicatorCode)?.principle === p).length;
    const tag = manualOnly.includes(p) ? "manual-entry only" : `${n} auto-sourced`;
    console.log(`    ${p}: ${byPrinciple[p] ?? 0} indicators — ${tag}`);
  }

  console.log(
    `\n✅  BRSR seeded. Section A=${SECTION_A.length}, Section B=${SECTION_B.length}, ` +
    `Section C=${ALL_INDICATORS.length - SECTION_A.length - SECTION_B.length}.`
  );
  console.log(
    `\n⚠  ${ALL_INDICATORS.length} indicators carry sebiFormatVersion='${FORMAT_VERSION}'. ` +
    `Reconcile wording against the current SEBI circular before a live filing:\n` +
    `     SELECT code, label FROM "BrsrIndicator" WHERE "sebiFormatVersion" = '${FORMAT_VERSION}';`
  );
  console.log(
    `⚠  ${FACTORS.length} emission factors are unverified. Check each against its cited source, ` +
    `then clear the warning in "notes".`
  );
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
