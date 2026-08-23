import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import gsap from "gsap";

import type { StoryContentItem } from "./storyModel";

export interface DesktopStoryStream {
  accent: string;
  count: number;
  key: string;
  label: string;
  records: StoryContentItem[];
}

interface DesktopCardSwapProps {
  active: boolean;
  appIcon: ReactNode;
  copy: string;
  desktopCopyUri: string;
  eyebrow: string;
  onOpenApp: () => void;
  onOpenRecord: (item: StoryContentItem) => void;
  privacy: boolean;
  reducedMotion: boolean;
  streams: DesktopStoryStream[];
  title: string;
  viewportHeight: number;
  viewportWidth: number;
  wallpaperUri: string;
}

interface CardSwapProps {
  cardDistance?: number;
  children: ReactNode;
  delay?: number;
  easing?: "elastic" | "linear";
  height?: number | string;
  onCardClick?: (index: number) => void;
  pauseOnHover?: boolean;
  skewAmount?: number;
  verticalDistance?: number;
  width?: number | string;
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

const FALL_CLIPS = [
  "inset(3% 74% 57% 0%)",
  "inset(3% 29% 69% 36%)",
  "inset(3% 0% 62% 68%)",
  "inset(25% 23% 35% 56%)",
  "inset(27% 0% 24% 76%)",
  "inset(58% 22% 16% 56%)",
  "inset(56% 0% 14% 76%)",
  "inset(85% 2% 0% 4%)",
] as const;

const FALL_ROTATIONS = [-4, 3, -2, 5, -5, 3, -3, 1] as const;

const CSS = [
  ".desktop-card-swap-root * { box-sizing: border-box; }",
  ".desktop-cover-tile { transition: transform 180ms ease, border-color 180ms ease; }",
  ".desktop-cover-tile img { transition: transform 260ms cubic-bezier(.16,1,.3,1); }",
  ".desktop-cover-tile:hover { border-color: rgba(255,255,255,.5) !important; }",
  ".desktop-cover-tile:hover img { transform: scale(1.045); }",
  ".desktop-cover-tile:active { transform: scale(.98); }",
  ".desktop-cover-tile:focus-visible, .desktop-app-button:focus-visible { outline: 3px solid #25F4EE; outline-offset: 4px; }",
  ".desktop-card-swap-root .card-swap-container { position: absolute; bottom: 0; right: 0; transform: translate(5%, 20%); transform-origin: bottom right; perspective: 900px; overflow: visible; }",
  ".desktop-card-swap-root .card { position: absolute; top: 50%; left: 50%; border-radius: 12px; border: 1px solid #fff; background: #000; transform-style: preserve-3d; will-change: transform; backface-visibility: hidden; -webkit-backface-visibility: hidden; }",
  "@media (max-width: 768px) {",
  "  .desktop-card-swap-root .card-swap-container { transform: scale(.75) translate(25%, 25%); }",
  "}",
  "@media (max-width: 480px) {",
  "  .desktop-card-swap-root .card-swap-container { transform: scale(.55) translate(25%, 25%); }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  .desktop-cover-tile, .desktop-cover-tile img { transition: none; }",
  "}",
].join("\n");

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, ...rest }, ref) => (
  <div ref={ref} {...rest} className={`card ${customClass ?? ""} ${rest.className ?? ""}`.trim()} />
));
Card.displayName = "Card";

type CardRef = RefObject<HTMLDivElement | null>;
interface Slot {
  x: number;
  y: number;
  z: number;
  zIndex: number;
}

export const makeSlot = (index: number, distanceX: number, distanceY: number, total: number): Slot => ({
  x: index * distanceX,
  y: -index * distanceY,
  z: -index * distanceX * 1.5,
  zIndex: total - index,
});

const placeNow = (element: HTMLElement, slot: Slot, skew: number) => gsap.set(element, {
  x: slot.x,
  y: slot.y,
  z: slot.z,
  xPercent: -50,
  yPercent: -50,
  skewY: skew,
  transformOrigin: "center center",
  zIndex: slot.zIndex,
  force3D: true,
});

// ReactBits Card Swap source and defaults:
// https://reactbits.dev/components/card-swap
function CardSwap({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5_000,
  pauseOnHover = false,
  onCardClick,
  skewAmount = 6,
  easing = "elastic",
  children,
}: CardSwapProps) {
  const config = easing === "elastic"
    ? {
        ease: "elastic.out(0.6,0.9)",
        durDrop: 2,
        durMove: 2,
        durReturn: 2,
        promoteOverlap: 0.9,
        returnDelay: 0.05,
      }
    : {
        ease: "power1.inOut",
        durDrop: 0.8,
        durMove: 0.8,
        durReturn: 0.8,
        promoteOverlap: 0.45,
        returnDelay: 0.2,
      };
  const childArr = useMemo(
    () => Children.toArray(children) as ReactElement<CardProps>[],
    [children],
  );
  const refs = useMemo<CardRef[]>(
    () => childArr.map(() => React.createRef<HTMLDivElement>()),
    [childArr.length],
  );
  const order = useRef<number[]>(Array.from({ length: childArr.length }, (_, index) => index));
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number>(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const total = refs.length;
    refs.forEach((itemRef, index) => placeNow(
      itemRef.current!,
      makeSlot(index, cardDistance, verticalDistance, total),
      skewAmount,
    ));

    const swap = () => {
      const [front, ...rest] = order.current;
      if (front === undefined || order.current.length < 2) return;
      const frontElement = refs[front]!.current!;
      const timeline = gsap.timeline();
      tlRef.current = timeline;

      timeline.to(frontElement, {
        y: "+=500",
        duration: config.durDrop,
        ease: config.ease,
      });
      timeline.addLabel("promote", "-=" + config.durDrop * config.promoteOverlap);
      rest.forEach((index, position) => {
        const element = refs[index]!.current!;
        const slot = makeSlot(position, cardDistance, verticalDistance, refs.length);
        timeline.set(element, { zIndex: slot.zIndex }, "promote");
        timeline.to(element, {
          x: slot.x,
          y: slot.y,
          z: slot.z,
          duration: config.durMove,
          ease: config.ease,
        }, "promote+=" + position * 0.15);
      });
      const backSlot = makeSlot(refs.length - 1, cardDistance, verticalDistance, refs.length);
      timeline.addLabel("return", "promote+=" + config.durMove * config.returnDelay);
      timeline.call(() => {
        gsap.set(frontElement, { zIndex: backSlot.zIndex });
      }, undefined, "return");
      timeline.to(frontElement, {
        x: backSlot.x,
        y: backSlot.y,
        z: backSlot.z,
        duration: config.durReturn,
        ease: config.ease,
      }, "return");
      timeline.call(() => {
        order.current = [...rest, front];
      });
    };

    swap();
    intervalRef.current = window.setInterval(swap, delay);
    if (pauseOnHover) {
      const node = container.current!;
      const pause = () => {
        tlRef.current?.pause();
        clearInterval(intervalRef.current);
      };
      const resume = () => {
        tlRef.current?.play();
        intervalRef.current = window.setInterval(swap, delay);
      };
      node.addEventListener("mouseenter", pause);
      node.addEventListener("mouseleave", resume);
      return () => {
        node.removeEventListener("mouseenter", pause);
        node.removeEventListener("mouseleave", resume);
        clearInterval(intervalRef.current);
        tlRef.current?.kill();
      };
    }
    return () => {
      clearInterval(intervalRef.current);
      tlRef.current?.kill();
    };
  }, [cardDistance, verticalDistance, delay, pauseOnHover, skewAmount, easing]);

  const rendered = childArr.map((child, index) => isValidElement<CardProps>(child)
    ? cloneElement(child, {
        key: index,
        ref: refs[index],
        style: { width, height, ...(child.props.style ?? {}) },
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          child.props.onClick?.(event);
          onCardClick?.(index);
        },
      } as CardProps & React.RefAttributes<HTMLDivElement>)
    : child);

  return (
    <div
      ref={container}
      aria-label="观看、喜欢和收藏内容页轮换"
      className="card-swap-container"
      style={{ width, height }}
    >
      {rendered}
    </div>
  );
}

function CoverTile({
  accent,
  index,
  item,
  onOpen,
  privacy,
}: {
  accent: string;
  index: number;
  item: StoryContentItem;
  onOpen: (item: StoryContentItem) => void;
  privacy: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.record.coverUrl]);
  const showImage = Boolean(item.record.coverUrl && !privacy && !failed);

  return (
    <button
      aria-label={(privacy ? "内容封面已隐藏" : item.record.title) + "，打开详情"}
      className="desktop-cover-tile"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        padding: 0,
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        background: "linear-gradient(145deg, " + accent + "44, #171B23)",
        cursor: "pointer",
      }}
      title={privacy ? "内容封面已隐藏" : item.record.title}
      type="button"
    >
      {showImage ? (
        <img
          alt=""
          loading={index < 6 ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          src={item.record.coverUrl ?? undefined}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.72)",
            fontSize: 15,
            fontWeight: 800,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
    </button>
  );
}

function ContentPage({
  onOpen,
  privacy,
  stream,
}: {
  onOpen: (item: StoryContentItem) => void;
  privacy: boolean;
  stream: DesktopStoryStream;
}) {
  const covers = stream.records.slice(0, 18);
  return (
    <div
      aria-label={stream.label + "，" + stream.count.toLocaleString("zh-CN") + " 个视频"}
      role="group"
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <header
        style={{
          height: 72,
          flex: "0 0 72px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          borderTop: "4px solid " + stream.accent,
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,14,18,0.94)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong style={{ color: "#F4F6FA", fontSize: 20 }}>{stream.label}</strong>
          <span style={{ color: "rgba(244,246,250,0.5)", fontSize: 11 }}>视频封面</span>
        </div>
        <strong
          style={{
            color: "#F4F6FA",
            fontSize: 25,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {stream.count.toLocaleString("zh-CN")}
        </strong>
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gridAutoRows: "minmax(0, 1fr)",
          gap: 8,
          padding: 12,
          background: "#151820",
        }}
      >
        {covers.map((item, index) => (
          <CoverTile
            accent={stream.accent}
            index={index}
            item={item}
            key={item.key}
            onOpen={onOpen}
            privacy={privacy}
          />
        ))}
        {!covers.length ? (
          <p style={{ gridColumn: "1 / -1", alignSelf: "center", color: "rgba(244,246,250,0.56)", textAlign: "center" }}>
            当前列表没有可展示的封面
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DesktopCardSwap({
  active,
  appIcon,
  copy,
  desktopCopyUri,
  eyebrow,
  onOpenApp,
  onOpenRecord,
  privacy,
  reducedMotion,
  streams,
  title,
  viewportHeight,
  viewportWidth,
  wallpaperUri,
}: DesktopCardSwapProps) {
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<HTMLImageElement | null>(null);
  const sliceRefs = useRef<Array<HTMLImageElement | null>>([]);
  const appRef = useRef<HTMLButtonElement | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!active || !rootRef.current || !desktopRef.current || !snapshotRef.current || !appRef.current || !reportRef.current) {
      return undefined;
    }
    if (openedRef.current) {
      gsap.set(desktopRef.current, { autoAlpha: 0 });
      gsap.set(reportRef.current, { autoAlpha: 1, scale: 1 });
      return undefined;
    }
    setReady(false);
    const context = gsap.context(() => {
      gsap.set(desktopRef.current, { autoAlpha: 1, scale: 1 });
      gsap.set(reportRef.current, { autoAlpha: 0, scale: 0.985 });
      gsap.set(snapshotRef.current, { opacity: 1 });
      gsap.set(sliceRefs.current, { autoAlpha: 1, y: 0, rotation: 0 });
      gsap.set(appRef.current, { autoAlpha: 0, scale: 0.56, y: 22 });

      if (reducedMotion) {
        gsap.set(snapshotRef.current, { opacity: 0 });
        gsap.set(sliceRefs.current, { autoAlpha: 0 });
        gsap.set(appRef.current, { autoAlpha: 1, scale: 1, y: 0 });
        setReady(true);
        return;
      }

      gsap.timeline()
        .to({}, { duration: 0.72 })
        .to(snapshotRef.current, { opacity: 0, duration: 0.22, ease: "power1.out" })
        .to(sliceRefs.current, {
          y: Math.max(760, viewportHeight * 1.15),
          rotation: (index: number) => FALL_ROTATIONS[index] ?? 0,
          duration: 1.35,
          ease: "power4.in",
          stagger: 0.065,
        }, "<")
        .to(appRef.current, {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: 0.72,
          ease: "back.out(1.7)",
        }, "-=0.12")
        .call(() => setReady(true));
    }, rootRef);
    return () => context.revert();
  }, [active, reducedMotion, viewportHeight]);

  const openApp = useCallback(() => {
    if (!ready || opened || !desktopRef.current || !reportRef.current) return;
    openedRef.current = true;
    setOpened(true);
    onOpenApp();
    if (reducedMotion) {
      gsap.set(desktopRef.current, { autoAlpha: 0 });
      gsap.set(reportRef.current, { autoAlpha: 1, scale: 1 });
      return;
    }
    gsap.timeline()
      .to(desktopRef.current, {
        autoAlpha: 0,
        scale: 1.018,
        duration: 0.42,
        ease: "power2.inOut",
      })
      .to(reportRef.current, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.58,
        ease: "power3.out",
      }, "-=0.18");
  }, [onOpenApp, opened, ready, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className="desktop-card-swap-root"
      data-testid="desktop-card-swap"
      style={{
        position: "relative",
        width: "100%",
        minHeight: viewportHeight,
        overflow: "hidden",
        background: "#090B0F",
        color: "#F4F6FA",
      }}
    >
      <style>{CSS}</style>
      <div
        ref={desktopRef}
        aria-hidden={opened}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: opened ? "none" : "auto",
          transformOrigin: "center",
        }}
      >
        <img
          alt=""
          src={wallpaperUri}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <img
          ref={snapshotRef}
          alt="当前用户桌面的本地复制图"
          src={desktopCopyUri}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {FALL_CLIPS.map((clipPath, index) => (
          <img
            ref={(node) => {
              sliceRefs.current[index] = node;
            }}
            alt=""
            aria-hidden
            key={clipPath}
            src={desktopCopyUri}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              clipPath,
              willChange: "transform",
            }}
          />
        ))}
        <button
          ref={appRef}
          aria-hidden={!ready}
          aria-label="打开抖音内容页"
          className="desktop-app-button"
          disabled={!ready}
          onClick={openApp}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 13,
            width: 154,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "#F4F6FA",
            cursor: "inherit",
            transform: "translate(-50%, -50%)",
          }}
          tabIndex={ready ? 0 : -1}
          type="button"
        >
          <span
            style={{
              width: 116,
              height: 116,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.24)",
              borderRadius: 28,
              background: "#0A0C10",
              boxShadow: "0 24px 58px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            {appIcon}
          </span>
          <strong style={{ fontSize: 15, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>抖音</strong>
          <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            点击打开
          </span>
        </button>
      </div>

      <div
        ref={reportRef}
        aria-hidden={!opened}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          visibility: opened ? undefined : "hidden",
          opacity: opened ? undefined : 0,
          pointerEvents: opened ? "auto" : "none",
          background: "radial-gradient(circle at 72% 46%, rgba(37,244,238,0.08), transparent 34%), #090B0F",
        }}
      >
        <section
          style={{
            position: "absolute",
            top: reducedMotion ? 26 : viewportWidth < 1250 ? 58 : 82,
            left: reducedMotion ? 34 : viewportWidth < 1250 ? 44 : 72,
            width: reducedMotion ? 560 : viewportWidth < 1250 ? 260 : viewportWidth < 1450 ? 330 : 360,
            zIndex: 5,
          }}
        >
          <p style={{ margin: 0, color: "#25F4EE", fontSize: 11, fontWeight: 900 }}>
            {eyebrow}
          </p>
          <h1
            style={{
              maxWidth: reducedMotion ? 560 : 430,
              margin: reducedMotion ? "10px 0 0" : "14px 0 0",
              color: "#F4F6FA",
              fontSize: reducedMotion ? 36 : viewportWidth < 1250 ? 36 : 48,
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
            }}
          >
            {title}
          </h1>
          <p style={{ maxWidth: reducedMotion ? 520 : 350, margin: reducedMotion ? "12px 0 0" : "18px 0 0", color: "rgba(244,246,250,0.62)", fontSize: 14, lineHeight: 1.75 }}>
            {copy}
          </p>
          {!reducedMotion ? <div style={{ display: "grid", gap: 10, marginTop: 32 }}>
            {streams.map((stream) => (
              <div
                key={stream.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 18,
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <span style={{ color: stream.accent, fontSize: 13, fontWeight: 850 }}>{stream.label}</span>
                <span style={{ color: "#F4F6FA", fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                  {stream.count.toLocaleString("zh-CN")}
                </span>
              </div>
            ))}
          </div> : null}
        </section>

        {opened && reducedMotion ? (
          <div
            style={{
              position: "absolute",
              top: 190,
              right: 24,
              bottom: 24,
              left: 34,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            {streams.map((stream) => (
              <div key={stream.key} style={{ minWidth: 0, overflow: "hidden", borderRadius: 18, border: "1px solid rgba(255,255,255,0.18)" }}>
                <ContentPage onOpen={onOpenRecord} privacy={privacy} stream={stream} />
              </div>
            ))}
          </div>
        ) : opened ? (
          <div
            className="desktop-card-swap-stage"
            style={{ position: "absolute", top: 0, right: 0, width: "50%", height: "100%" }}
          >
            <CardSwap
              cardDistance={60}
              delay={5_000}
              easing="elastic"
              pauseOnHover={false}
              skewAmount={6}
              verticalDistance={70}
            >
              {streams.map((stream) => (
                <Card
                  key={stream.key}
                  style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
                >
                  <ContentPage onOpen={onOpenRecord} privacy={privacy} stream={stream} />
                </Card>
              ))}
            </CardSwap>
          </div>
        ) : null}
      </div>
    </div>
  );
}
