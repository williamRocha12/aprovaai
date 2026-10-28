"use client";

import type { FeatureFlag } from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const flags = useQuery({
    queryKey: ["flags"],
    queryFn: () => api.get<FeatureFlag[]>("/api/admin/feature-flags"),
  });
  const toggle = useMutation({
    mutationFn: (flag: FeatureFlag) =>
      api.patch(`/api/admin/feature-flags/${flag.key}`, { enabled: !flag.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flags"] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Feature flags</h1>
        <p className="text-sm text-muted-foreground">
          Liga e desliga recursos sem deploy. Login Google e IA também exigem as credenciais configuradas no
          servidor.
        </p>
      </div>
      {toggle.error && <Alert variant="error">{errorMessage(toggle.error)}</Alert>}
      {flags.isPending ? (
        <LoadingState />
      ) : flags.isError ? (
        <Alert variant="error">{errorMessage(flags.error)}</Alert>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {flags.data.map((f) => (
              <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {f.description} <code className="text-xs text-muted-foreground">{f.key}</code>
                  </p>
                  <p className="text-xs text-muted-foreground">Alterada em {formatDateTime(f.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={f.enabled ? "success" : "neutral"}>{f.enabled ? "Ligada" : "Desligada"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle.mutate(f)}
                    loading={toggle.isPending && toggle.variables?.key === f.key}
                  >
                    {f.enabled ? "Desligar" : "Ligar"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
