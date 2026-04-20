export interface Science {
  id: number;
  name: string;
}

export interface Book {
  id: number;
  science_id: number;
  title: string;
  total_pages: number;
  science_name?: string;
}

export interface Sharh {
  id: number;
  book_id: number;
  title: string;
  author?: string;
}

export interface Question {
  id?: number;
  fawaid_id?: number;
  type: string;
  question: string;
  answer: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface Fawaid {
  id: number;
  book_id: number;
  sharh_id?: number;
  page_number?: number;
  reference?: string;
  title: string;
  content: string;
  created_at: string;
  tags: string[];
  book_title?: string;
  science_name?: string;
  science_id?: number;
  author?: string;
  sharh_title?: string;
  question_types?: string[];
  keywords?: string[];
  questions?: Question[];
  extra_notes?: string;
  volume_number?: string;
  tabah?: string;
  language?: 'arabic' | 'english';
  priority?: 'red' | 'yellow' | 'green';
  lastReviewedAt?: string;
  
  // FSRS SRS fields
  due?: string;
  stability?: number;
  difficulty?: number;
  elapsed_days?: number;
  scheduled_days?: number;
  reps?: number;
  lapses?: number;
  state?: number;
  learning_steps?: number;
}

export interface Stats {
  totalSciences: number;
  totalBooks: number;
  totalFawaid: number;
  scienceStats: { name: string; count: number }[];
}
