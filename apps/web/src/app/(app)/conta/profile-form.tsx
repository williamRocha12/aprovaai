"use client";

import { EDUCATION_LEVELS, updateProfileSchema, type MeResponse } from "@aprovaai/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

const EDUCATION_LABELS: Record<(typeof EDUCATION_LEVELS)[number], string> = {
  fundamental: "Ensino fundamental",
  medio: "Ensino médio",
  superior: "Ensino superior",
};

export function ProfileForm({ user }: { user: MeResponse }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user.profile.displayName ?? "");
  const [educationLevel, setEducationLevel] = useState(user.profile.educationLevel ?? "");
  const [interestAreas, setInterestAreas] = useState(user.profile.interestAreas.join(", "));
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({
      displayName: displayName.trim() || null,
      educationLevel: educationLevel || null,
      interestAreas: interestAreas
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setStatus({
        kind: "error",
        text: "Confira os campos: nome de exibição com 2 a 80 letras e áreas com 2 a 60.",
      });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await api.patch("/api/me/profile", parsed.data);
      setStatus({ kind: "success", text: "Perfil salvo." });
      router.refresh();
    } catch (error) {
      setStatus({ kind: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      {status && (
        <div className="md:col-span-2">
          <Alert variant={status.kind}>{status.text}</Alert>
        </div>
      )}
      <Field id="displayName" label="Nome de exibição">
        <Input
          {...fieldAria("displayName")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>
      <Field id="educationLevel" label="Escolaridade">
        <Select
          {...fieldAria("educationLevel")}
          value={educationLevel}
          onChange={(e) => setEducationLevel(e.target.value)}
        >
          <option value="">Não informar</option>
          {EDUCATION_LEVELS.map((level) => (
            <option key={level} value={level}>
              {EDUCATION_LABELS[level]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field
          id="interestAreas"
          label="Áreas de interesse"
          hint="Separe por vírgula. Ex.: tribunais, fiscal, policial"
        >
          <Input
            {...fieldAria("interestAreas", undefined, true)}
            value={interestAreas}
            onChange={(e) => setInterestAreas(e.target.value)}
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" loading={saving}>
          Salvar perfil
        </Button>
      </div>
    </form>
  );
}
