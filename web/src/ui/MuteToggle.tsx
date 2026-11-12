import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { sound } from "@/lib/sound";

export function MuteToggle() {
  const muted = useSyncExternalStore(
    (fn) => sound.subscribe(fn),
    () => sound.muted,
    () => true,
  );
  return (
    <button
      type="button"
      onClick={() => sound.setMuted(!muted)}
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-glass backdrop-blur-md hover:border-brass"
    >
      {muted ? <VolumeX className="size-4 text-muted" aria-hidden /> : <Volume2 className="size-4 text-brass" aria-hidden />}
    </button>
  );
}
