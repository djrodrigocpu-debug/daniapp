import { AssessmentAnswer, TrafficLight } from '../types';
import { themes } from '../data/catalog';

const statusValue: Record<TrafficLight, number | null> = {
  green: 1,
  yellow: 0.5,
  red: 0,
  not_evaluated: 0,
  not_applicable: null,
};

export function calculateScore(answers: AssessmentAnswer[]): number {
  let earned = 0;
  let possible = 0;

  for (const answer of answers) {
    const theme = themes.find((item) => item.id === answer.themeId);
    if (!theme) continue;
    const value = statusValue[answer.status];
    if (value === null) continue;
    possible += theme.weight;
    earned += theme.weight * value;
  }

  if (possible === 0) return 0;
  return Math.round((earned / possible) * 100);
}

export function completionRate(answers: AssessmentAnswer[]): number {
  if (!answers.length) return 0;
  const completed = answers.filter((answer) => answer.status !== 'not_evaluated').length;
  return Math.round((completed / answers.length) * 100);
}
