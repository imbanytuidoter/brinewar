import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect } from "react";
import { useBallProto } from "./models";
import { useRuntime } from "./runtime";

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
    effects.update(clock.elapsedTime, Math.min(delta, 0.05));
  });

  return <primitive object={effects.group} />;
}
