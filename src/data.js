const defaultRequirement = {
  character: "银狼",
  fandom: "崩坏:星穹铁道",
  city: "北京",
  dateStart: "2026-07-16",
  dateEnd: "2026-07-18",
  preferredDate: "2026-07-18",
  budget: 800,
  style: "电影感",
  ownedItems: ["服装"],
  notes: "想拍棚拍正片，偏暗调和游戏感，希望尽量少自己沟通。",
  rawText: "我想在7月16到18日之间，在北京拍《崩坏:星穹铁道》银狼，预算800元以内，偏电影感/暗调，目前只有服装，希望少一点自己沟通。",
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


