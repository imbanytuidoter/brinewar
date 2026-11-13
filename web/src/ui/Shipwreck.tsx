import { Component, type ReactNode } from "react";

interface ShipwreckProps {
  readonly children: ReactNode;
  readonly fallback: (reload: () => void) => ReactNode;
}

interface ShipwreckState {
  readonly failed: boolean;
}

export class Shipwreck extends Component<ShipwreckProps, ShipwreckState> {
  override state: ShipwreckState = { failed: false };

  static getDerivedStateFromError(): ShipwreckState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback(() => window.location.reload());
    return this.props.children;
  }
}
