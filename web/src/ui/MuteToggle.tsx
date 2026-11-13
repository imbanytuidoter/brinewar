import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sound } from "@/lib/sound";

const subscribe = (fn: () => void): (() => void) => sound.subscribe(fn);

export function MuteToggle() {
  const id = useId();
  const muted = useSyncExternalStore(subscribe, () => sound.muted, () => true);
  const volume = useSyncExternalStore(subscribe, () => sound.volume, () => 0.8);
  const silent = muted || volume === 0;
  const Icon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Sound"
        className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-glass backdrop-blur-md hover:border-brass data-[state=open]:border-brass"
      >
        <Icon className={silent ? "size-4 text-muted" : "size-4 text-brass"} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-56 gap-2.5">
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-xs font-semibold text-ink">
            Volume
          </label>
          <span className="font-mono text-[11px] tabular-nums">{silent ? "off" : `${Math.round(volume * 100)}%`}</span>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={silent ? 0 : Math.round(volume * 100)}
          onChange={(e) => {
            sound.setVolume(Number(e.target.value) / 100);
            sound.unlock();
          }}
          className="w-full accent-brass"
        />
        <button
          type="button"
          onClick={() => sound.setMuted(!muted)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-brass"
        >
          {muted ? <Volume2 className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}
          {muted ? "Turn sound on" : "Mute"}
        </button>
      </PopoverContent>
    </Popover>
  );
}
