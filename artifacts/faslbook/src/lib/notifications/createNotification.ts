export async function createNotification(params: {
  organizationId: string;
  title: string;
  description: string;
  type: "farm" | "inventory" | "finance" | "team";
  targetUserId?: string;
}) {
  const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("@/lib/firebase/config");

  await addDoc(collection(db, "notifications"), {
    organizationId: params.organizationId,
    title: params.title,
    description: params.description,
    type: params.type,
    targetUserId: params.targetUserId ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}
