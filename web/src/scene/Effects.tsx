import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect } from "react";
import { useBallProto } from "./models";
import { useRuntime } from "./runtime";

const MAX_EFFECT_DT = 0.1;

export function Effects() {
  const { effects } = useRuntime();
  const ball = useBallProto();
  const height = useThree((s) => s.size.height);

  useLayoutEffect(() => {
    effects.setBall(ball);
  }, [effects, ball]);

  useEffect(() => {
    effects.setViewportHeight(height);
  }, [effects, height]);

  useFrame(({ clock }, delta) => {
    effects.update(clock.elapsedTime, Math.min(delta, MAX_EFFECT_DT));
  });

  return <primitive object={effects.group} />;
}
