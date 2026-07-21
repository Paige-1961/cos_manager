const defaultRequirement = {
  character: "路飞",
  fandom: "海贼王",
  city: "北京",
  dateStart: "2026-08-01",
  dateEnd: "2026-08-31",
  preferredDate: "2026-08-31",
  budget: 1500,
  style: "未指定",
  ownedItems: [],
  notes: "需要假发、妆造和摄影。",
  rawText: "我要在北京拍《海贼王》路飞的角色扮演写真，2026年8月，预算1500，需要假发、妆造和摄影。",
};

const roleRequirements = [
  { role: "makeup", label: "妆娘", neededWhenMissing: ["妆造"] },
  { role: "wig", label: "毛娘/假发", neededWhenMissing: ["假发", "发型"] },
  { role: "photographer", label: "摄影师", neededWhenMissing: ["摄影"] },
  { role: "studio", label: "摄影棚", neededWhenMissing: ["场地"] },
  { role: "retoucher", label: "后期", optional: true, neededWhenMissing: ["后期"] },
];




window.defaultRequirement = defaultRequirement;
window.roleRequirements = roleRequirements;


