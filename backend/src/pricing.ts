export type PricingRule = {id:string;kind:'visit'|'treatment'|'parking';doctorId:string|null;categoryId:string|null;consultationType?:string|null;serviceCode?:string|null;officeId?:string|null;amountKzt:number;ratePerHourKzt:number|null;freeMinutes:number;rounding:'per_started_hour'|'per_minute';dailyCapKzt:number|null;effectiveFrom:Date;effectiveTo:Date|null};
/** Specificity: doctor+consultation type, category+consultation type, doctor, category, then global. Latest effectiveFrom breaks ties. */
export function resolvePricingRule(rules:PricingRule[],kind:PricingRule['kind'],at:Date,doctorId?:string|null,categoryId?:string|null,consultationType?:string|null,officeId?:string|null){
  const eligible=rules.filter(r=>r.kind===kind&&r.effectiveFrom<=at&&(!r.effectiveTo||r.effectiveTo>at)&&(!r.doctorId||r.doctorId===doctorId)&&(!r.categoryId||r.categoryId===categoryId)&&(!r.consultationType||r.consultationType===consultationType)&&(!r.officeId||r.officeId===officeId));
  const specificity=(r:PricingRule)=>r.doctorId&&r.consultationType?5:r.categoryId&&r.consultationType?4:r.doctorId?3:r.categoryId?2:r.officeId?1:0;
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
