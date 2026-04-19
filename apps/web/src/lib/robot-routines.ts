export interface RobotRoutine {
  id: string;
  name: string;
  duration: number; // minutes
  description: string;
}

export const ROBOT_ROUTINES: RobotRoutine[] = [
  {
    id: "shoulder-neck",
    name: "肩颈调理",
    duration: 30,
    description: "针对肩颈酸痛的艾灸调理方案",
  },
  {
    id: "lumbar",
    name: "腰椎养护",
    duration: 25,
    description: "腰椎日常养护艾灸方案",
  },
  {
    id: "knee",
    name: "膝关节温通",
    duration: 20,
    description: "膝关节温经通络艾灸方案",
  },
  {
    id: "spleen-stomach",
    name: "脾胃调理",
    duration: 30,
    description: "调理脾胃功能的艾灸方案",
  },
  {
    id: "womb",
    name: "女性温宫",
    duration: 35,
    description: "女性宫寒温煦艾灸方案",
  },
  {
    id: "full-body",
    name: "全身通络",
    duration: 45,
    description: "全身经络疏通艾灸方案",
  },
];
