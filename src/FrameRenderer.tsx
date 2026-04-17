import { useParams } from "react-router";
import { lazy, Suspense } from "react";

const pageConfigs = import.meta.glob("./pages/*/page.json", { eager: true });
const frameModules = import.meta.glob("./pages/*/*.tsx");

// Build a lookup: `${pageId}/${frameId}` -> lazy component, all at module level
const frameComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {};

for (const [path, mod] of Object.entries(pageConfigs)) {
  const dir = path.replace("/page.json", "");
  const config = (mod as { default: { pageId: string; frames: { id: string }[] } }).default;
  for (const frame of config.frames) {
    const modulePath = `${dir}/${frame.id}.tsx`;
    if (frameModules[modulePath]) {
      frameComponents[`${config.pageId}/${frame.id}`] = lazy(
        frameModules[modulePath] as () => Promise<{ default: React.ComponentType }>
      );
    }
  }
}

export default function FrameRenderer() {
  const { pageId, frameId } = useParams();
  const Frame = frameComponents[`${pageId}/${frameId}`];

  if (!Frame) return <div></div>;

  return (
    <Suspense fallback={<div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh"
    }}>Loading...</div>}>
      <Frame />
    </Suspense>
  );
}