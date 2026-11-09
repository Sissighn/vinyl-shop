"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type RoomAlbum = {
  id: string;
  title: string;
  artist: string;
  image: string;
  uri: string;
};

type Props = {
  slots: (RoomAlbum | null)[];
  playing: boolean;
  activeAlbumUri: string | null;
  onSlotClick: (index: number) => void;
  onSlotDrop: (from: number, to: number) => void;
  onTonearmClick: () => void;
  onBackgroundClick: () => void;
};

type SceneControls = {
  setPlaying: (value: boolean) => void;
  animateRecord: (index: number) => void;
  updateSlots: (albums: (RoomAlbum | null)[]) => void;
  highlightSlot: (index: number | null) => void;
};
type DragPreview = { x: number; y: number; album: RoomAlbum; target: number | null };
type SlotRect = { left: number; top: number; width: number; height: number };

const SLOT_POSITIONS = [
  [-4.75, 2.55], [-1.58, 2.55], [1.58, 2.55], [4.75, 2.55],
  [-4.75, 0.43], [-1.58, 0.43], [1.58, 0.43], [4.75, 0.43],
] as const;
const RECORD_RADIANS_PER_SECOND = (Math.PI * 2 * 33 + Math.PI * 2 / 3) / 60;

function createWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#68412e";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = 0; x < canvas.width; x += 1) {
    const wave = Math.sin(x * 0.083) * 8 + Math.sin(x * 0.018) * 18;
    const lightness = Math.floor(13 + 9 * Math.sin(x * 0.031) + 5 * Math.sin(x * 0.18));
    context.strokeStyle = `rgba(29,12,5,${Math.max(0.025, (lightness + 13) / 230)})`;
    context.lineWidth = 1 + (x % 7 === 0 ? 1 : 0);
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x + wave, 70, x - wave * 0.7, 180, x + wave * 0.4, 256);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

function box(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  material: THREE.Material,
  position: [number, number, number],
  segments = 48,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function rod(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const vector = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, vector.length(), 12), material);
  mesh.position.copy(from).addScaledVector(vector, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeSpeaker(parent: THREE.Object3D, x: number, wood: THREE.Material) {
  const speaker = new THREE.Group();
  speaker.position.set(x, -0.25, 0.85);
  parent.add(speaker);
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x191715, roughness: 0.78 });
  const grille = new THREE.MeshStandardMaterial({ color: 0x292420, roughness: 0.96 });
  const cone = new THREE.MeshStandardMaterial({ color: 0x131312, roughness: 0.88 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x766c5e, metalness: 0.7, roughness: 0.32 });
  box(speaker, 1.55, 1.62, 0.92, wood, [0, 0, 0]);
  box(speaker, 1.37, 1.44, 0.045, grille, [0, 0, 0.49]);
  box(speaker, 1.49, 0.06, 0.99, charcoal, [0, -0.76, 0]);
  for (const [y, radius] of [[0.26, 0.36], [-0.38, 0.25]] as const) {
    const outer = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.032, 10, 48), metal);
    outer.position.set(0, y, 0.54);
    speaker.add(outer);
    const driver = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.86, 48), cone);
    driver.position.set(0, y, 0.55);
    speaker.add(driver);
    const dustCap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.32, 24, 12), charcoal);
    dustCap.scale.z = 0.32;
    dustCap.position.set(0, y, 0.57);
    speaker.add(dustCap);
  }
}

export default function VinylRoomScene({ slots, playing, activeAlbumUri, onSlotClick, onSlotDrop, onTonearmClick, onBackgroundClick }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<SceneControls | null>(null);
  const onSlotClickRef = useRef(onSlotClick);
  const onSlotDropRef = useRef(onSlotDrop);
  const onTonearmClickRef = useRef(onTonearmClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  const playingRef = useRef(playing);
  const slotsRef = useRef(slots);
  const activeAlbumUriRef = useRef(activeAlbumUri);
  const [available, setAvailable] = useState(true);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [slotRects, setSlotRects] = useState<SlotRect[]>([]);
  const [keyboardMoveFrom, setKeyboardMoveFrom] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => { onSlotClickRef.current = onSlotClick; }, [onSlotClick]);
  useEffect(() => { onSlotDropRef.current = onSlotDrop; }, [onSlotDrop]);
  useEffect(() => { onTonearmClickRef.current = onTonearmClick; }, [onTonearmClick]);
  useEffect(() => { onBackgroundClickRef.current = onBackgroundClick; }, [onBackgroundClick]);
  useEffect(() => {
    slotsRef.current = slots;
    controlsRef.current?.updateSlots(slots);
  }, [slots]);
  useEffect(() => {
    playingRef.current = playing;
    controlsRef.current?.setPlaying(playing);
  }, [playing]);
  useEffect(() => {
    if (activeAlbumUriRef.current !== activeAlbumUri && activeAlbumUri) {
      const index = slots.findIndex((album) => album?.uri === activeAlbumUri);
      if (index >= 0) controlsRef.current?.animateRecord(index);
    }
    activeAlbumUriRef.current = activeAlbumUri;
  }, [activeAlbumUri, slots]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "default" });
    } catch {
      const timer = window.setTimeout(() => setAvailable(false), 0);
      return () => window.clearTimeout(timer);
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = false;
    renderer.domElement.className = "room-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x201619);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    const cameraTarget = new THREE.Vector3(0, 0.05, -0.5);
    camera.position.set(0, 2.95, 12.3);
    camera.lookAt(cameraTarget);

    const wall = new THREE.MeshStandardMaterial({ color: 0x987c74, roughness: 1 });
    const wallAccent = new THREE.MeshStandardMaterial({ color: 0x694a4b, roughness: 1 });
    const woodTexture = createWoodTexture();
    const wood = new THREE.MeshStandardMaterial({ color: 0xe4c3a4, map: woodTexture, roughness: 0.69, metalness: 0.025, bumpMap: woodTexture, bumpScale: 0.018 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x3b241c, roughness: 0.85 });
    const black = new THREE.MeshStandardMaterial({ color: 0x161615, roughness: 0.38, metalness: 0.18 });
    const vinyl = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.24, metalness: 0.3 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xb6ada0, roughness: 0.28, metalness: 0.8 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.97 });
    const warmLight = new THREE.MeshBasicMaterial({ color: 0xffbb76 });

    box(scene, 30, 14, 0.2, wall, [0, 0.4, -4.2]);
    box(scene, 0.3, 14, 10, wallAccent, [-12.5, 0, 0.5]);
    box(scene, 0.3, 14, 10, wallAccent, [12.5, 0, 0.5]);
    box(scene, 30, 0.12, 20, woodDark, [0, -3.5, 1.5]);
    box(scene, 30, 0.16, 0.12, woodDark, [0, -3.36, -4.05]);

    scene.add(new THREE.AmbientLight(0xffdbc0, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffe7c7, 1.55);
    keyLight.position.set(-4.7, 7, 7);
    scene.add(keyLight);
    const redWash = new THREE.PointLight(0xd63732, 105, 13, 1.6);
    redWash.position.set(8, 2.7, 0.5);
    scene.add(redWash);
    const amberWash = new THREE.PointLight(0xffa451, 34, 10, 1.65);
    amberWash.position.set(-7, 0.5, 2.2);
    scene.add(amberWash);

    const hitTargets: THREE.Object3D[] = [];
    const sleeveMeshes: THREE.Mesh[] = [];
    const shelfRows = [1.66, -0.46];
    for (const shelfY of shelfRows) {
      box(scene, 13.0, 0.16, 0.72, woodDark, [0, shelfY, -2.88]);
      box(scene, 13.0, 0.035, 0.74, wood, [0, shelfY + 0.1, -2.88]);
      box(scene, 13.0, 0.045, 0.12, warmLight, [0, shelfY - 0.1, -2.49]);
      for (const x of [-3.25, 3.25]) {
        const light = new THREE.PointLight(0xffad67, 8, 5.8, 1.5);
        light.position.set(x, shelfY - 0.17, -2.35);
        scene.add(light);
      }
    }

    const textureLoader = new THREE.TextureLoader();
    const coverFaces: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>[] = [];
    const coverTextures: (THREE.Texture | null)[] = Array.from({ length: SLOT_POSITIONS.length }, () => null);
    const coverSources: string[] = Array.from({ length: SLOT_POSITIONS.length }, () => "");
    const coverRequests: number[] = Array.from({ length: SLOT_POSITIONS.length }, () => 0);
    let disposed = false;
    textureLoader.setCrossOrigin("anonymous");
    SLOT_POSITIONS.forEach(([x, y], index) => {
      const sleeve = box(scene, 1.57, 1.57, 0.065, cream.clone(), [x, y, -2.62]);
      sleeve.userData.slotIndex = index;
      hitTargets.push(sleeve);
      sleeveMeshes.push(sleeve);
      box(scene, 1.62, 0.042, 0.2, woodDark, [x, y - 0.81, -2.52]);
      const coverFace = new THREE.Mesh(
        new THREE.PlaneGeometry(1.55, 1.55),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 }),
      );
      coverFace.position.z = 0.034;
      coverFace.visible = false;
      sleeve.add(coverFace);
      coverFaces.push(coverFace);
    });

    // The cabinet is deliberately almost as wide as the fixed camera frame.
    box(scene, 14.2, 0.22, 2.56, wood, [0, -1.25, 0.95]);
    box(scene, 14.0, 1.9, 2.23, wood, [0, -2.31, 0.79]);
    box(scene, 14.2, 0.15, 2.4, woodDark, [0, -3.28, 0.9]);
    box(scene, 0.09, 1.67, 0.08, woodDark, [-2.35, -2.31, 1.94]);
    box(scene, 0.09, 1.67, 0.08, woodDark, [2.35, -2.31, 1.94]);
    box(scene, 0.09, 1.67, 0.08, woodDark, [0, -2.31, 1.94]);
    for (const x of [-4.65, -1.5, 1.5, 4.65]) {
      box(scene, 0.75, 0.035, 0.035, silver, [x, -2.25, 1.97]);
    }
    for (const x of [-6.35, -4.7, -3.05, -1.65, 0, 1.65, 3.05, 4.7, 6.35]) {
      box(scene, 0.012, 1.7, 0.012, woodDark, [x, -2.31, 1.948]);
    }

    makeSpeaker(scene, -4.65, woodDark);
    makeSpeaker(scene, 4.65, woodDark);

    const deck = new THREE.Group();
    deck.position.set(0, -1.07, 1.08);
    scene.add(deck);
    box(deck, 4.55, 0.22, 2.24, black, [0, 0, 0]);
    box(deck, 4.48, 0.035, 2.18, silver, [0, 0.12, 0]);
    const platter = cylinder(deck, 1.06, 0.12, black, [-0.63, 0.2, 0.04], 72);
    platter.castShadow = true;
    const record = new THREE.Group();
    record.position.set(-0.63, 0.27, 0.04);
    deck.add(record);
    cylinder(record, 0.99, 0.035, vinyl, [0, 0, 0], 96);
    for (const radius of [0.48, 0.62, 0.75, 0.87]) {
      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.002, 6, 100),
        new THREE.MeshBasicMaterial({ color: 0x4b4946, transparent: true, opacity: 0.65 }),
      );
      groove.rotation.x = -Math.PI / 2;
      groove.position.y = 0.021;
      record.add(groove);
    }
    // Asymmetric, very subtle groove highlights make the entire black disc's spin legible.
    for (const [radius, angle, arc] of [
      [0.53, 0.15, 0.48], [0.68, 1.42, 0.37], [0.81, 2.63, 0.54],
      [0.92, 4.18, 0.35], [0.58, 5.24, 0.31],
    ]) {
      const glint = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.006, 4, 32, arc),
        new THREE.MeshBasicMaterial({ color: 0x85817a, transparent: true, opacity: 0.24 }),
      );
      glint.rotation.x = -Math.PI / 2;
      glint.rotation.z = angle;
      glint.position.y = 0.024;
      record.add(glint);
    }
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.039, 64),
      new THREE.MeshStandardMaterial({ color: 0xdcc5a2, roughness: 0.95 }),
    );
    label.position.y = 0.022;
    record.add(label);
    // A small printed label detail makes the rotation visible without adding album artwork.
    const labelInk = new THREE.MeshStandardMaterial({ color: 0x594134, roughness: 1 });
    box(record, 0.27, 0.003, 0.028, labelInk, [0, 0.043, -0.12]);
    box(record, 0.17, 0.003, 0.014, labelInk, [0, 0.043, -0.17]);
    cylinder(record, 0.024, 0.075, silver, [0, 0.064, 0]);

    const tonearm = new THREE.Group();
    tonearm.position.set(1.64, 0.24, -0.73);
    deck.add(tonearm);
    cylinder(tonearm, 0.2, 0.13, silver, [0, 0, 0]);
    rod(tonearm, new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(-0.2, 0.19, 0.4), 0.034, silver);
    rod(tonearm, new THREE.Vector3(-0.2, 0.19, 0.4), new THREE.Vector3(-1.05, 0.18, 1.28), 0.025, silver);
    box(tonearm, 0.17, 0.11, 0.25, black, [-1.1, 0.14, 1.34]);
    rod(tonearm, new THREE.Vector3(-1.1, 0.09, 1.36), new THREE.Vector3(-1.1, 0.04, 1.36), 0.012, silver);
    const tonearmHit = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    tonearmHit.position.set(-1.08, 0.15, 1.31);
    tonearm.add(tonearmHit);

    const knobs = [-1.82, 1.77];
    for (const x of knobs) {
      cylinder(deck, 0.09, 0.075, black, [x, 0.18, 0.77], 32);
      cylinder(deck, 0.044, 0.079, silver, [x, 0.21, 0.77], 32);
    }
    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2785e }),
    );
    indicator.position.set(1.45, 0.16, 0.79);
    deck.add(indicator);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let frame = 0;
    let lastFrameTime = 0;
    let isPlaying = playingRef.current;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionPreference.matches;
    let tonearmTarget = isPlaying ? -0.68 : 0.2;
    let tonearmHeightTarget = isPlaying ? 0.24 : 0.34;
    let pointerDown: { index: number | null; x: number; y: number; dragging: boolean } | null = null;
    let highlightedSlot: number | null = null;
    let animation: {
      mesh: THREE.Mesh;
      from: THREE.Vector3;
      start: number;
    } | null = null;

    function requestRender() {
      if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(animate);
    }
    function setPlaying(value: boolean) {
      isPlaying = value;
      tonearmTarget = value ? -0.68 : 0.2;
      tonearmHeightTarget = value ? 0.24 : 0.34;
      if (reduceMotion) {
        tonearm.rotation.y = tonearmTarget;
        tonearm.position.y = tonearmHeightTarget;
      }
      indicator.visible = value;
      requestRender();
    }
    function updateSlots(albums: (RoomAlbum | null)[]) {
      albums.forEach((album, index) => {
        const source = album?.image ?? "";
        if (coverSources[index] === source) return;
        coverSources[index] = source;
        const requestId = ++coverRequests[index];
        coverTextures[index]?.dispose();
        coverTextures[index] = null;
        const face = coverFaces[index];
        face.material.map = null;
        face.material.needsUpdate = true;
        face.visible = false;
        if (!source) { requestRender(); return; }
        let pendingTexture: THREE.Texture | null = null;
        pendingTexture = textureLoader.load(source, (texture) => {
          if (disposed || coverRequests[index] !== requestId) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
          coverTextures[index] = texture;
          face.material.map = texture;
          face.material.needsUpdate = true;
          face.visible = true;
          requestRender();
        }, undefined, () => {
          pendingTexture?.dispose();
          requestRender();
        });
        requestRender();
      });
    }
    function animateRecord(index: number) {
      const source = sleeveMeshes[index];
      if (animation) {
        scene.remove(animation.mesh);
        animation.mesh.geometry.dispose();
      }
      const moving = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.025, 64), vinyl);
      moving.castShadow = true;
      moving.position.copy(source.position);
      moving.rotation.x = Math.PI / 2;
      scene.add(moving);
      animation = { mesh: moving, from: source.position.clone(), start: performance.now() };
      requestRender();
    }

    function getHit(event: PointerEvent): { kind: "slot"; index: number } | { kind: "tonearm" } | null {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects([...hitTargets, tonearm], true);
      for (const intersection of intersections) {
        let object: THREE.Object3D | null = intersection.object;
        while (object && object !== scene) {
          if (object === tonearm) return { kind: "tonearm" };
          if (typeof object.userData.slotIndex === "number") return { kind: "slot", index: object.userData.slotIndex };
          object = object.parent;
        }
      }
      return null;
    }
    function highlightSlot(index: number | null) {
      if (highlightedSlot === index) return;
      if (highlightedSlot !== null) (sleeveMeshes[highlightedSlot].material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      highlightedSlot = index;
      if (index !== null) (sleeveMeshes[index].material as THREE.MeshStandardMaterial).emissive.setHex(0x684027);
      requestRender();
    }
    function handlePointerMove(event: PointerEvent) {
      const hit = getHit(event);
      if (pointerDown?.index !== null && pointerDown?.index !== undefined && slotsRef.current[pointerDown.index]) {
        if (pointerDown.dragging || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) {
          pointerDown.dragging = true;
          const target = hit?.kind === "slot" && hit.index !== pointerDown.index ? hit.index : null;
          highlightSlot(target);
          setDragPreview({ x: event.clientX, y: event.clientY, album: slotsRef.current[pointerDown.index]!, target });
          renderer.domElement.style.cursor = "grabbing";
          return;
        }
      }
      renderer.domElement.style.cursor = hit ? "pointer" : "default";
    }
    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const hit = getHit(event);
      pointerDown = { index: hit?.kind === "slot" ? hit.index : null, x: event.clientX, y: event.clientY, dragging: false };
      renderer.domElement.setPointerCapture(event.pointerId);
      if (hit?.kind === "tonearm") onTonearmClickRef.current();
    }
    function handlePointerUp(event: PointerEvent) {
      if (!pointerDown) return;
      const start = pointerDown;
      pointerDown = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      const hit = getHit(event);
      highlightSlot(null);
      setDragPreview(null);
      if (start.dragging && start.index !== null) {
        if (hit?.kind === "slot" && hit.index !== start.index) onSlotDropRef.current(start.index, hit.index);
        return;
      }
      if (hit?.kind === "slot" && hit.index === start.index) onSlotClickRef.current(hit.index);
      else if (!hit && start.index === null) onBackgroundClickRef.current();
    }
    function handlePointerCancel() {
      pointerDown = null;
      highlightSlot(null);
      setDragPreview(null);
    }
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerCancel);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      const mobile = camera.aspect < 1.05;
      camera.position.z = mobile ? 18.5 : 12.3;
      camera.fov = mobile ? 52 : 43;
      camera.updateProjectionMatrix();
      camera.lookAt(cameraTarget);
      renderer.setSize(width, height, false);
      setSlotRects(SLOT_POSITIONS.map(([x, y]) => {
        const leftTop = new THREE.Vector3(x - 0.81, y + 0.81, -2.58).project(camera);
        const rightBottom = new THREE.Vector3(x + 0.81, y - 0.81, -2.58).project(camera);
        return {
          left: (leftTop.x + 1) * width / 2,
          top: (1 - leftTop.y) * height / 2,
          width: (rightBottom.x - leftTop.x) * width / 2,
          height: (leftTop.y - rightBottom.y) * height / 2,
        };
      }));
      requestRender();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    function animate(time: number) {
      frame = 0;
      if (document.hidden) { lastFrameTime = 0; return; }
      const elapsedSeconds = lastFrameTime ? Math.min((time - lastFrameTime) / 1000, 0.05) : 0;
      lastFrameTime = time;
      if (isPlaying && !reduceMotion) record.rotation.y += RECORD_RADIANS_PER_SECOND * elapsedSeconds;
      const armMoving = !reduceMotion && (Math.abs(tonearm.rotation.y - tonearmTarget) > 0.002 || Math.abs(tonearm.position.y - tonearmHeightTarget) > 0.002);
      if (armMoving) {
        const fraction = Math.min(1, elapsedSeconds * 12);
        tonearm.rotation.y += (tonearmTarget - tonearm.rotation.y) * fraction;
        tonearm.position.y += (tonearmHeightTarget - tonearm.position.y) * fraction;
      }
      if (animation) {
        const elapsed = Math.min(1, (time - animation.start) / 850);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        animation.mesh.position.lerpVectors(
          animation.from,
          new THREE.Vector3(-0.63, -0.73, 1.12),
          eased,
        );
        animation.mesh.position.y += Math.sin(elapsed * Math.PI) * 0.8;
        animation.mesh.rotation.x = Math.PI / 2 * (1 - eased);
        animation.mesh.rotation.y = elapsed * 0.35;
        animation.mesh.scale.setScalar(1 - 0.08 * eased);
        if (elapsed >= 1) {
          scene.remove(animation.mesh);
          animation.mesh.geometry.dispose();
          animation = null;
        }
      }
      renderer.render(scene, camera);
      if ((isPlaying && !reduceMotion) || animation || armMoving) requestRender();
    }
    const visibilityChanged = () => { lastFrameTime = 0; requestRender(); };
    const motionChanged = () => { reduceMotion = motionPreference.matches; setPlaying(isPlaying); };
    document.addEventListener("visibilitychange", visibilityChanged);
    motionPreference.addEventListener("change", motionChanged);
    controlsRef.current = { setPlaying, animateRecord, updateSlots, highlightSlot };
    setPlaying(playingRef.current);
    updateSlots(slotsRef.current);
    requestRender();

    return () => {
      disposed = true;
      controlsRef.current = null;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibilityChanged);
      motionPreference.removeEventListener("change", motionChanged);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => materials.add(material));
      });
      materials.forEach((material) => material.dispose());
      coverTextures.forEach((texture) => texture?.dispose());
      woodTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  function focusSlot(index: number) {
    mountRef.current?.querySelector<HTMLButtonElement>(`[data-wall-slot="${index}"]`)?.focus();
  }

  function activateSlot(index: number) {
    if (keyboardMoveFrom !== null) {
      if (keyboardMoveFrom !== index) {
        onSlotDrop(keyboardMoveFrom, index);
        setAnnouncement(`Record moved to wall spot ${index + 1}.`);
      }
      setKeyboardMoveFrom(null);
      return;
    }
    onSlotClick(index);
  }

  function handleSlotKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? Math.min(7, index + 1)
      : event.key === "ArrowLeft" ? Math.max(0, index - 1)
        : event.key === "ArrowDown" ? Math.min(7, index + 4)
          : event.key === "ArrowUp" ? Math.max(0, index - 4) : null;
    if (next !== null) { event.preventDefault(); focusSlot(next); return; }
    if (event.key === "Escape" && keyboardMoveFrom !== null) {
      event.preventDefault();
      event.stopPropagation();
      setKeyboardMoveFrom(null);
      setAnnouncement("Move cancelled.");
      return;
    }
    if (event.key !== " ") return;
    event.preventDefault();
    if (keyboardMoveFrom !== null) { activateSlot(index); return; }
    if (!slots[index]) { onSlotClick(index); return; }
    setKeyboardMoveFrom(index);
    setAnnouncement(`Picked up ${slots[index]?.title}. Choose another spot and press Enter or Space.`);
  }

  return (
    <div className="scene-mount" ref={mountRef}>
      {!available && <div className="webgl-fallback">Your browser needs WebGL to display the 3D room.</div>}
      <p id="wall-keyboard-help" className="sr-only">Use arrow keys to move between wall spots. Press Enter to open a record. Press Space to pick up a record, then Enter or Space on another spot to move or swap it. Escape cancels.</p>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
      <div className={`wall-keyboard ${available ? "" : "fallback"}`} aria-label="Album wall">
        {SLOT_POSITIONS.map((_, index) => (
          <button
            key={index}
            type="button"
            data-wall-slot={index}
            className="wall-keyboard-slot"
            style={slotRects[index]}
            aria-label={`Wall spot ${index + 1}: ${slots[index] ? `${slots[index].title} by ${slots[index].artist}` : "empty"}`}
            aria-describedby="wall-keyboard-help"
            aria-pressed={keyboardMoveFrom === index}
            onClick={() => activateSlot(index)}
            onKeyDown={(event) => handleSlotKey(event, index)}
            onFocus={() => controlsRef.current?.highlightSlot(index)}
            onBlur={() => controlsRef.current?.highlightSlot(null)}
          >{!available ? `Spot ${index + 1}: ${slots[index]?.title ?? "empty"}` : null}</button>
        ))}
      </div>
      {dragPreview && (
        <div className="wall-drag-preview" style={{ left: dragPreview.x, top: dragPreview.y }} aria-hidden="true">
          {dragPreview.album.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dragPreview.album.image} alt="" />
          ) : <span />}
          <small>{dragPreview.target === null ? "DRAG TO A WALL SPOT" : `SWAP WITH SPOT ${dragPreview.target + 1}`}</small>
        </div>
      )}
    </div>
  );
}
