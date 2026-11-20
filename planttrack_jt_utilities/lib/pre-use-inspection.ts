/** JT Utilities Inspection Sheet.xlsx — section order and checks from the signed workshop sheet.
 * Each check stores its decision under the item name and its notes under "item name - Comments".
 * These are inspection records, not authority to release a safety lockout.
 */
export const PRE_USE_SHEET_VERSION = "JT Utilities Inspection Sheet v1";
export const PRE_USE_SECTIONS = [
 {name:"ENGINE",items:["Engine Oil & Filters","Air & Fuel Filters / Pre Filters","Coolant Radiator Hoses Antifreeze","Fan & Drive Belts & Pulleys","Engine & Other Mountings","Fuel Tank System"]},
 {name:"TRANSMISSIONS",items:["Operation of Clutch","Transmission Oils & Filters","Axle Oils & Breathers","Drive / Prop Shaft & Couplings","Oil Cooler & Hoses","Wheel Bearing & Hubs","Wheel Nut Tightness, Tyres C & P"]},
 {name:"HYDRAULICS",items:["Hydraulic Oil & Filters Breather Vents","Hydraulic Pumps, Pipes & Hoses","Hydraulic Rams, Pins & Bushes","Other Hydraulic Components"]},
 {name:"EXCAVATORS",items:["Track Condition Tension","Sprockets, Idlers, Rollers","Quick Hitch & Attachments","Condition of Boom/Hitch Sticker"]},
 {name:"ROLLERS",items:["Roller Mountings","Sprinkler Scrapers"]},
 {name:"TELEHANDLERS / FORKLIFTS",items:["Forks Masts Chains Roller Wear Pads","Counter Weight Security & SWL Charts"]},
 {name:"CABS & CHASSIS",items:["Operation of Steering & Linkage","Operation of Foot/Hand & Overrun Brakes","Tow Bar Eye Pin & Retainer","Grease All Parts"]},
 {name:"ELECTRICAL",items:["Battery Security, Top Up & Charging","Lights/Horn/Beacon/Warning Devices","Engine Gauges & Warning Lights"]},
 {name:"SAFETY",items:["Cab Door/Step/Glass/Canopy","Bonnet/Catches","Seat Belts / Controls ROPS FOPS","Safety Stickers In Place"]},
 {name:"ALL FUNCTIONS TEST",items:["Ops Manual","Key","Service Sticker","Cleaned","Asset Number Visible","Glass / Mirrors","Grease Gun / Cartridge"]}
] as const;
export const PRE_USE_ITEMS: string[] = PRE_USE_SECTIONS.flatMap(section=>[...section.items]);
export const PRE_USE_RESULT_PASS = "Pass - safe for proposed use";
export const PRE_USE_RESULT_FAIL = "Fail - do not use";
export const PRE_USE_DECISIONS = ["Checked","N/A","Defect"] as const;
export const PRE_USE_LEGACY_ITEMS = [
 "Previous repair / defect reference","Fluid levels and visible leaks","Tyres / tracks and running gear",
 "Brakes steering and controls","Guards alarms and safety devices","Functional test completed",
 "Pre-use result","Outstanding defects / restrictions"
] as const;
export const preUseIsFullSheet=(job:{job_type?:string;job_details?:Record<string,unknown>}):boolean=>
 job.job_type==="Pre-use / return-to-work check"&&job.job_details?.["Inspection sheet version"]===PRE_USE_SHEET_VERSION;
export const preUseHasDefects=(answers:Record<string,string>):boolean=>
 PRE_USE_ITEMS.some(item=>answers[item]==="Defect");
