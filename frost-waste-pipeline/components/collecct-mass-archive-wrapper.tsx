"use client";

import { MassArchive } from "@/components/mass-archive";
import { useRouter } from "next/navigation";

export function CollecctMassArchiveWrapper({ documents }: { documents: any[] }) {
  const router = useRouter();
  return (
    <MassArchive 
      documents={documents} 
      onArchiveComplete={() => router.push("/collecct")} 
    />
  );
}
