/**
 * The Analytics Screen Contract.
 *
 * Four components every analytics screen in SafeOps360 consumes, so that ten
 * screens cannot drift into ten different ideas of what a KPI, a finding or a
 * filter is. Reference implementation: Incidents › Analytics.
 *
 *   <InsightRail />      ranked deterministic findings, one severity vocabulary
 *   <ContextKPI />       a number is never shown without a comparator
 *   <SegmentBar />       sticky site / severity / window filters, URL-persisted
 *   <DataQualityFlag />  a metric that CANNOT be computed never renders as zero
 */
export { InsightRail } from "./insight-rail";
export type { InsightFinding, InsightRailProps, InsightSeverity } from "./insight-rail";

export { ContextKPI } from "./context-kpi";
export type { ContextKPIProps } from "./context-kpi";

export { SegmentBar } from "./segment-bar";
export type { SegmentBarProps, SegmentOption } from "./segment-bar";

export { DataQualityFlag } from "./data-quality-flag";
export type { DataQualityFlagProps } from "./data-quality-flag";
