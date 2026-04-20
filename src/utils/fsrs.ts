import { Card, FSRS, Rating, State, createEmptyCard } from 'ts-fsrs';
import { Fawaid } from '../types';

const fsrs = new FSRS({});

export function fawaidToFsrsCard(fawaid: Fawaid): Card {
  if (fawaid.due === undefined || fawaid.due === null) {
      return createEmptyCard();
  }
  
  return {
    due: new Date(fawaid.due),
    stability: fawaid.stability || 0,
    difficulty: fawaid.difficulty || 0,
    elapsed_days: fawaid.elapsed_days || 0,
    scheduled_days: fawaid.scheduled_days || 0,
    reps: fawaid.reps || 0,
    lapses: fawaid.lapses || 0,
    state: fawaid.state !== undefined ? (fawaid.state as State) : State.New,
    last_review: fawaid.lastReviewedAt ? new Date(fawaid.lastReviewedAt) : undefined,
    learning_steps: fawaid.learning_steps || 0
  };
}

export function gradeFawaid(fawaid: Fawaid, rating: Rating, now: Date = new Date()) {
  const card = fawaidToFsrsCard(fawaid);
  const scheduling = fsrs.repeat(card, now);
  const record = scheduling[rating];
  
  return {
    due: record.card.due.toISOString(),
    stability: record.card.stability,
    difficulty: record.card.difficulty,
    elapsed_days: record.card.elapsed_days,
    scheduled_days: record.card.scheduled_days,
    reps: record.card.reps,
    lapses: record.card.lapses,
    state: record.card.state,
    lastReviewedAt: now.toISOString(),
    learning_steps: record.card.learning_steps
  };
}

export function getNextIntervals(fawaid: Fawaid, now: Date = new Date()) {
  const card = fawaidToFsrsCard(fawaid);
  const scheduling = fsrs.repeat(card, now);
  
  const formatDiff = (due: Date) => {
    const diff = due.getTime() - now.getTime();
    if (diff < 0) return 'Due';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d`;
    return `${Math.round(days / 30)}mo`;
  };

  return {
    [Rating.Again]: formatDiff(scheduling[Rating.Again].card.due),
    [Rating.Hard]: formatDiff(scheduling[Rating.Hard].card.due),
    [Rating.Good]: formatDiff(scheduling[Rating.Good].card.due),
    [Rating.Easy]: formatDiff(scheduling[Rating.Easy].card.due),
  };
}
