import { getQuiz } from "@/data/api";
import { QuizScreen } from "@/features/onboarding/quiz-screen";

/** 04 성향 체크 — 기획안의 4문항을 20문항(축별 5개)으로 늘렸다. */
export default async function QuizPage() {
  const questions = await getQuiz();
  return <QuizScreen questions={questions} />;
}
