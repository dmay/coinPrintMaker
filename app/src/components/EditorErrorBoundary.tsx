import { Component } from 'react';
import type { ReactNode } from 'react';

export class EditorErrorBoundary extends Component<{ readonly children: ReactNode; readonly resetKey: number }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: Readonly<{ readonly children: ReactNode; readonly resetKey: number }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <section className="editor-error" role="alert" aria-labelledby="editor-error-heading">
      <h2 id="editor-error-heading">The editor view could not be displayed</h2>
      <p>Your imported artwork is still held in this page. Try the view again, or choose another SVG above.</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>Try editor view again</button>
    </section>;
    return this.props.children;
  }
}
