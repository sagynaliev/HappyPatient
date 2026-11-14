export type PricingRule = {id:string;kind:'visit'|'treatment'|'parking';doctorId:string|null;categoryId:string|null;consultationType?:string|null;serviceCode?:string|null;officeId?:string|null;amountKzt:number;ratePerHourKzt:number|null;freeMinutes:number;rounding:'per_started_hour'|'per_minute';dailyCapKzt:number|null;effectiveFrom:Date;effectiveTo:Date|null};
/** How the patient attends (chosen when booking) and whether they have seen this doctor before (decided by the system). */
export const CONSULTATION_CHANNELS=['in-person','online'] as const;
export const VISIT_KINDS=['first','follow-up'] as const;
export type ConsultationChannel=typeof CONSULTATION_CHANNELS[number];
export type VisitKind=typeof VISIT_KINDS[number];
/** A booking's consultation type, stored on the visit: "in-person:first", "online:follow-up", … */
export const consultationKey=(channel:ConsultationChannel,visitKind:VisitKind)=>`${channel}:${visitKind}`;
/** Rule types an administrator can price: one part ("online", "follow-up") or both ("online:follow-up"). */
export const RULE_CONSULTATION_TYPES=[...CONSULTATION_CHANNELS,...VISIT_KINDS,...CONSULTATION_CHANNELS.flatMap(channel=>VISIT_KINDS.map(kind=>consultationKey(channel,kind)))];
const typeParts=(type?:string|null)=>type?type.split(':').map(part=>part.trim()).filter(Boolean):[];
/** A rule's type applies when every part of it is part of the booking's type; a rule without a type applies to all. */
const typeMatches=(ruleType:string|null|undefined,bookingType:string|null|undefined)=>{const parts=typeParts(ruleType);if(!parts.length)return true;const booking=typeParts(bookingType);return parts.every(part=>booking.includes(part));};
/**
 * Specificity: a rule for a consultation type beats one without; then doctor, specialty, office, global;
 * then a two-part type ("online:follow-up") beats a one-part type ("online"). Latest effectiveFrom breaks ties.
 */
export function resolvePricingRule(rules:PricingRule[],kind:PricingRule['kind'],at:Date,doctorId?:string|null,categoryId?:string|null,consultationType?:string|null,officeId?:string|null){
  const eligible=rules.filter(r=>r.kind===kind&&r.effectiveFrom<=at&&(!r.effectiveTo||r.effectiveTo>at)&&(!r.doctorId||r.doctorId===doctorId)&&(!r.categoryId||r.categoryId===categoryId)&&typeMatches(r.consultationType,consultationType)&&(!r.officeId||r.officeId===officeId));
  const specificity=(r:PricingRule)=>{const parts=typeParts(r.consultationType).length;return (parts?100:0)+(r.doctorId?30:r.categoryId?20:r.officeId?10:0)+parts;};
  return eligible.sort((a,b)=>specificity(b)-specificity(a)||b.effectiveFrom.getTime()-a.effectiveFrom.getTime())[0];
}
export function calculateParkingCost(durationMinutes:number,rule:Pick<PricingRule,'freeMinutes'|'rounding'|'ratePerHourKzt'|'dailyCapKzt'>){const minutes=Math.max(0,durationMinutes-rule.freeMinutes);const amount=Math.round((rule.rounding==='per_started_hour'?Math.ceil(minutes/60):minutes/60)*(rule.ratePerHourKzt??0));return rule.dailyCapKzt===null?amount:Math.min(amount,rule.dailyCapKzt);}
export type VisitCostLine={kind:'consultation'|'treatment';label:string;amountKzt:number;ruleId?:string};
export function calculateVisitCost(consultationFee:number,rule?:Pick<PricingRule,'id'|'amountKzt'>,treatments:Array<{label:string;amountKzt:number;ruleId?:string}>=[]){
  const appliesRule=Boolean(rule&&rule.amountKzt>0);
  const consultationKzt=appliesRule?rule!.amountKzt:consultationFee;
  const lines:VisitCostLine[]=[{kind:'consultation',label:'Consultation fee',amountKzt:consultationKzt,...(appliesRule?{ruleId:rule!.id}:{})},...treatments.map(item=>({kind:'treatment' as const,...item}))];
  return {consultationKzt,lines,totalKzt:lines.reduce((sum,line)=>sum+line.amountKzt,0),ruleIds:lines.flatMap(line=>line.ruleId?[line.ruleId]:[])};
}
