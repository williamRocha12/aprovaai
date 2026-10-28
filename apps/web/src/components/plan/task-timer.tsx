"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

interface TimerState {
  taskId: string;
  /** Início do trecho em andamento (ms) ou null se pausado. */
  runningSince: number | null;
  /** Milissegundos acumulados em trechos anteriores. */
  accumulatedMs: number;
  /** Primeiro início (para registrar a sessão). */
  firstStartedAt: number;
}

const STORAGE_KEY = "aprovaai.timer";
const CHANGE_EVENT = "aprovaai:timer";

// O cronômetro vive no localStorage (sobrevive a recarregar a página). Se o armazenamento
// estiver indisponível (aba anônima, bloqueio), cai para memória enquanto a página estiver aberta.
let memoryValue: string | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryValue;
  }
}

function writeRaw(value: string | null) {
  memoryValue = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // mantém só em memória
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function parse(raw: string | null, taskId: string | null): TimerState | null {
  if (!raw || !taskId) return null;
  try {
    const state = JSON.parse(raw) as TimerState;
    return state.taskId === taskId ? state : null;
  } catch {
    return null;
  }
}

/** Relógio só chamado em handlers e efeitos, nunca durante o render. */
function nowMs(): number {
  return Date.now();
}

export function elapsedMs(state: TimerState | null, now: number): number {
  if (!state) return 0;
  return state.accumulatedMs + (state.runningSince ? Math.max(0, now - state.runningSince) : 0);
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Cronômetro do bloco atual, por tarefa. */
export function useTaskTimer(taskId: string | null) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const state = parse(raw, taskId);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!state?.runningSince) return;
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(first);
    };
  }, [state?.runningSince]);

  const save = (next: TimerState | null) => writeRaw(next ? JSON.stringify(next) : null);
  const current = () => elapsedMs(state, nowMs());

  return {
    state,
    elapsedMs: state?.runningSince
      ? elapsedMs(state, Math.max(now, state.runningSince))
      : elapsedMs(state, 0),
    running: Boolean(state?.runningSince),
    /** Tempo exato no momento da chamada (usar ao concluir). */
    currentElapsedMs: current,
    start: () => {
      if (!taskId) return;
      const t = nowMs();
      save(
        state
          ? { ...state, runningSince: t }
          : { taskId, runningSince: t, accumulatedMs: 0, firstStartedAt: t },
      );
    },
    pause: () => state && save({ ...state, accumulatedMs: current(), runningSince: null }),
    reset: () => save(null),
  };
}

export function TimerDisplay({ timer }: { timer: ReturnType<typeof useTaskTimer> }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-3xl tabular-nums" aria-label="Tempo estudado">
        {format(timer.elapsedMs)}
      </span>
      {timer.running ? (
        <Button variant="outline" onClick={timer.pause}>
          <Pause className="size-4" aria-hidden /> Pausar
        </Button>
      ) : (
        <Button variant="outline" onClick={timer.start}>
          <Play className="size-4" aria-hidden /> {timer.state ? "Retomar" : "Iniciar"}
        </Button>
      )}
    </div>
  );
}
