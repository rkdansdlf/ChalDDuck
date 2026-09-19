import { notFound } from "next/navigation";
import { getContribKinds } from "@/data/api";
import { ContribAddScreen } from "@/features/contrib/contrib-add-screen";

/** 23 기여 기록 추가. 어떤 종류를 넣는지는 16 화면의 시트에서 고른다. */
export default async function ContribAddPage({ searchParams }: PageProps<"/team/contrib/add">) {
  const { kind: requested } = await searchParams;
  const kinds = await getContribKinds();
  const kind = kinds.find((k) => k.key === requested);
  if (!kind) notFound();

  return <ContribAddScreen kind={kind} />;
}
