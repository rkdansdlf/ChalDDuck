import { getQuiz } from "@/data/api";
import { QuizScreen } from "@/features/onboarding/quiz-screen";

/** 04 30초 MBTI 판별 — 기획안의 4문항 그대로. */
export default async function QuizPage() {
  const questions = await getQuiz();
  return <QuizScreen questions={questions} />;
}
