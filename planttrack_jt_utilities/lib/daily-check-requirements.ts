export type DailyCheckAsset={
  category?:string|null;
  description?:string|null;
  daily_plant_check_required?:boolean|null;
};
/** An explicit administrator setting always takes precedence over the default. */
export function requiresDailyPlantCheck(asset:DailyCheckAsset):boolean{
  if(typeof asset.daily_plant_check_required==="boolean")return asset.daily_plant_check_required;
  const category=(asset.category||"").trim().toLowerCase();
  const description=(asset.description||"").toLowerCase();
  if(category==="plant"||category==="agricultural equipment")return true;
  // Site-operating machinery can be registered as 'Vehicle'. Do not include
  // road vehicles, HGVs or trailers without an explicit administrator override.
  if(category==="vehicle"&&/\b(dumper|tractor|excavator|trencher|roller|telehandler|loader)\b/.test(description))return true;
  if(category==="vehicle"&&/wacker neuson dv90/.test(description))return true;
  return false;
}
export const MISSING_PLANT_CHECK_ALERT_HOUR_UK=10;
export function ukDateString(value:Date):string{
  const entries=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);
  const vals=Object.fromEntries(entries.map(p=>[p.type,p.value]));
  return vals.year+"-"+vals.month+"-"+vals.day;
}
export function ukHour(value:Date):number{
  return Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",hour:"2-digit",hourCycle:"h23"}).format(value));
}
