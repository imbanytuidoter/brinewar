import { Music, Volume1, Volume2, VolumeX } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { music } from "@/lib/musicBox";
import { sound } from "@/lib/sound";

const subscribe = (fn: () => void): (() => void) => sound.subscribe(fn);
const subscribeMusic = (fn: () => void): (() => void) => music.subscribe(fn);

export function MuteToggle() {
  const id = useId();
  const muted = useSyncExternalStore(subscribe, () => sound.muted, () => true);
  const volume = useSyncExternalStore(subscribe, () => sound.volume, () => 0.8);
  const musicId = useId();
  const musicVolume = useSyncExternalStore(subscribeMusic, () => music.volume, () => 0.5);
  const musicBlocked = useSyncExternalStore(subscribeMusic, () => music.blocked, () => false);
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
          <label htmlFor={id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Volume2 className="size-3.5 text-brass" aria-hidden />
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
        <div className="flex items-center justify-between">
          <label htmlFor={musicId} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Music className="size-3.5 text-brass" aria-hidden />
            Music
          </label>
          <span className="font-mono text-[11px] tabular-nums">{musicVolume === 0 ? "off" : `${Math.round(musicVolume * 100)}%`}</span>
        </div>
        <input
          id={musicId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(musicVolume * 100)}
          onChange={(e) => {
            music.setVolume(Number(e.target.value) / 100);
            if (muted && Number(e.target.value) > 0) sound.setMuted(false);
            music.unlock();
          }}
          className="w-full accent-brass"
        />
        {musicBlocked && musicVolume > 0 && !silent && <p className="m-0 text-[11px] leading-snug text-muted">Your browser holds the music until you tap anywhere on the page.</p>}
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
