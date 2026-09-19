import type { Draft } from "../../../types";
import { arcFromEntity, normalizeDegrees, pointOnCircle } from "../../sketch/sketchArc";

type Vec2 = { x: number; y: number };
type Vec3 = [number, number, number];

export type SemanticFaceMarker = {
  id: string;
  label: string;
  origin: Vec2;
  u: Vec2 | null;
  v: Vec2 | null;
  outOfPlane: "u" | "v" | null;
  /** Source locator metadata used to show only the face selected in the sketch. */
  locatorKind?: "profileEdge" | "profileRegion";
  /** Source sketch edge id for profileEdge locators (kept for compatibility). */
  sourceEntityId?: string;
  /** Source sketch region id for profileRegion locators. */
  sourceRegionId?: string;
  capSide?: "start" | "end" | null;
  /** The supporting sketch edge, used to distinguish the chosen line. */
  sourceSegment?: { start: Vec2; end: Vec2 };
};

export type SemanticFaceSelection =
  | { kind: "edge"; sourceEntityIds: string[] }
  | { kind: "region"; sourceRegionIds: string[] }
  | null;

/** Keep UV display coupled to an explicit sketch selection intent. */
export function filterSemanticFaceMarkers(
  markers: SemanticFaceMarker[],
  selection: SemanticFaceSelection,
): SemanticFaceMarker[] {
  if (!selection) return [];
  const ids = new Set(
    selection.kind === "edge"
      ? selection.sourceEntityIds
      : selection.sourceRegionIds,
  );
  return markers.filter((marker) =>
    selection.kind === "edge"
      ? marker.locatorKind === "profileEdge" &&
        marker.sourceEntityId != null &&
        ids.has(marker.sourceEntityId)
      : marker.locatorKind === "profileRegion" &&
        ids.has(marker.sourceRegionId ?? marker.sourceEntityId ?? ""),
  );
}

/** Return closed additive regions completely covered by the selected entities. */
export function regionsForSelectedEntities(
  draft: Draft,
  selectedEntityIds: string[],
): string[] {
  const selected = new Set(selectedEntityIds);
  return draft.sketch.regions
    .filter(
      (region) =>
        region.closed &&
        region.operation === "add" &&
        region.boundaryRefs.length > 0 &&
        region.boundaryRefs.every((id) => selected.has(id)),
    )
    .map((region) => region.id);
}

const HOST_AXES: Record<string, { u: Vec3; v: Vec3; normal: Vec3 }> = {
  negativeY: { u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] },
  positiveY: { u: [1, 0, 0], v: [0, 0, 1], normal: [0, 1, 0] },
  negativeX: { u: [0, 1, 0], v: [0, 0, 1], normal: [-1, 0, 0] },
  positiveX: { u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] },
  negativeZ: { u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, -1] },
  positiveZ: { u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
};

const PLANE_BASIS: Record<Draft["sketch"]["plane"], { x: Vec3; y: Vec3 }> = {
  XY: { x: [1, 0, 0], y: [0, 1, 0] },
  XZ: { x: [1, 0, 0], y: [0, 0, 1] },
  YZ: { x: [0, 1, 0], y: [0, 0, 1] },
};

const PLANE_NORMAL: Record<Draft["sketch"]["plane"], Vec3> = {
  XY: [0, 0, 1],
  XZ: [0, 1, 0],
  YZ: [1, 0, 0],
};

const PROFILE_LOCATOR_OPERATORS = new Set([
  "profile.open_profile_tube_extrude",
  "sketch.region_extrude",
]);

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, factor: number): Vec3 => [a[0] * factor, a[1] * factor, a[2] * factor];

function toGlobal(point: [number, number], plane: Draft["sketch"]["plane"]): Vec3 {
  const basis = PLANE_BASIS[plane];
  return add(scale(basis.x, point[0]), scale(basis.y, point[1]));
}

function project(vector: Vec3, plane: Draft["sketch"]["plane"]): Vec2 | null {
  const basis = PLANE_BASIS[plane];
  const x = dot(vector, basis.x);
  const y = dot(vector, basis.y);
  return Math.hypot(x, y) > 1e-9 ? { x, y } : null;
}

const arcAngleIsOnSweep = (startAngle: number, sweep: number, probeAngle: number) => {
  if (Math.abs(Math.abs(sweep) - 360) < 1e-6) return true;
  return sweep >= 0
    ? normalizeDegrees(probeAngle - startAngle) <= sweep + 1e-6
    : normalizeDegrees(startAngle - probeAngle) <= -sweep + 1e-6;
};

type SourcePointResult = { points: [number, number][]; valid: boolean };

function entityBoundsPoints(entity: Draft["sketch"]["entities"][number]): SourcePointResult {
  if (entity.construction) return { points: [], valid: false };
  if (entity.geometryType === "line") {
    if (!entity.start || !entity.end) return { points: [], valid: false };
    const points = [entity.start, entity.end];
    return points.every((point) => point.every(Number.isFinite)) &&
      Math.hypot(entity.end[0] - entity.start[0], entity.end[1] - entity.start[1]) > 1e-9
      ? { points, valid: true }
      : { points: [], valid: false };
  }
  if (entity.geometryType === "circle") {
    if (!entity.center || !entity.center.every(Number.isFinite) || entity.radius == null || !Number.isFinite(entity.radius) || entity.radius <= 0) {
      return { points: [], valid: false };
    }
    const [x, y] = entity.center;
    const radius = entity.radius;
    return {
      points: [[x - radius, y], [x + radius, y], [x, y - radius], [x, y + radius]],
      valid: true,
    };
  }
  if (entity.geometryType === "arc") {
    const geometry = arcFromEntity(entity);
    if (
      !geometry ||
      !Number.isFinite(geometry.radius) ||
      geometry.radius <= 0 ||
      !geometry.center.every(Number.isFinite) ||
      !geometry.start.every(Number.isFinite) ||
      !geometry.end.every(Number.isFinite)
    ) return { points: [], valid: false };
    const points: [number, number][] = [geometry.start, geometry.end];
    for (const angle of [0, 90, 180, 270]) {
      if (arcAngleIsOnSweep(geometry.startAngle, geometry.sweep, angle)) {
        points.push(pointOnCircle(geometry.center, geometry.radius, angle));
      }
    }
    return points.every((point) => point.every(Number.isFinite))
      ? { points, valid: true }
      : { points: [], valid: false };
  }
  return { points: [], valid: false };
}

function sourcePoints(
  draft: Draft,
  locator: NonNullable<Draft["geometryRecipe"]["semanticFaces"][number]["locator"]>,
): [number, number][] {
  const operations = draft.geometryRecipe.operations;
  const recipeSketches = draft.geometryRecipe.sketches;
  if (!Array.isArray(operations) || !Array.isArray(recipeSketches)) return [];
  const operation = operations.find((item) => item.id === locator.operationId);
  if (
    !operation ||
    !PROFILE_LOCATOR_OPERATORS.has(operation.operator) ||
    !recipeSketches.includes(locator.profileSketchId) ||
    (operation.profileSketchId && operation.profileSketchId !== locator.profileSketchId) ||
    !Array.isArray(operation.sourceRefs) ||
    !operation.sourceRefs.includes(locator.profileSketchId)
  ) return [];

  if (locator.kind === "profileEdge") {
    if (locator.capSide != null) return [];
    const matchingEntities = draft.sketch.entities.filter((item) => item.id === locator.sourceEntityId);
    const entity = matchingEntities.length === 1 ? matchingEntities[0] : undefined;
    const containingRegions = draft.sketch.regions.filter(
      (region) => region.closed && region.boundaryRefs.includes(locator.sourceEntityId),
    );
    if (
      !entity ||
      entity.construction ||
      entity.geometryType !== "line" ||
      !entity.start ||
      !entity.end ||
      containingRegions.length !== 1 ||
      !entity.start.every(Number.isFinite) ||
      !entity.end.every(Number.isFinite) ||
      Math.hypot(entity.end[0] - entity.start[0], entity.end[1] - entity.start[1]) <= 1e-9
    ) return [];
    return [entity.start, entity.end];
  }

  if (locator.kind !== "profileRegion" || (locator.capSide !== "start" && locator.capSide !== "end")) return [];

  const matchingRegions = draft.sketch.regions.filter((item) => item.id === locator.sourceEntityId);
  const region = matchingRegions.length === 1 ? matchingRegions[0] : undefined;
  if (!region?.closed || region.operation !== "add" || !region.boundaryRefs.length) return [];
  const entities = region.boundaryRefs.map((id) => draft.sketch.entities.find((item) => item.id === id));
  if (entities.some((entity) => !entity)) return [];
  const results = entities.map((entity) => entityBoundsPoints(entity!));
  if (results.some((result) => !result.valid)) return [];
  return results.flatMap((result) => result.points);
}

function frameIsCompatible(
  draft: Draft,
  locator: NonNullable<Draft["geometryRecipe"]["semanticFaces"][number]["locator"]>,
  axes: { u: Vec3; v: Vec3; normal: Vec3 },
) {
  const planeNormal = PLANE_NORMAL[draft.sketch.plane];
  if (locator.kind === "profileRegion") {
    return Math.abs(dot(planeNormal, axes.normal)) > 1 - 1e-7;
  }
  const entity = draft.sketch.entities.find((item) => item.id === locator.sourceEntityId);
  if (!entity?.start || !entity.end) return false;
  const start = toGlobal(entity.start, draft.sketch.plane);
  const end = toGlobal(entity.end, draft.sketch.plane);
  const edge = [end[0] - start[0], end[1] - start[1], end[2] - start[2]] as Vec3;
  const length = Math.hypot(...edge);
  if (length <= 1e-9 || Math.abs(dot(planeNormal, axes.normal)) > 1e-7) return false;
  const inPlaneAxis = Math.abs(dot(axes.u, planeNormal)) < 1e-7 ? axes.u : axes.v;
  return Math.abs(dot(edge, inPlaneAxis)) / length > 1 - 1e-7;
}

const shortFaceId = (id: string) => id.split(".").slice(-2).join(".") || id;

export function semanticFaceMarkers(draft: Draft): SemanticFaceMarker[] {
  const plane = draft.sketch.plane;
  return draft.geometryRecipe.semanticFaces.flatMap((face) => {
    const locator = face.locator;
    const axes = HOST_AXES[face.hostFrame];
    if (!locator || !axes || face.sourceOperationId !== locator.operationId || !frameIsCompatible(draft, locator, axes)) return [];
    const points = sourcePoints(draft, locator);
    if (!points.length) return [];
    const globalPoints = points.map((point) => toGlobal(point, plane));
    const minimumU = Math.min(...globalPoints.map((point) => dot(point, axes.u)));
    const minimumV = Math.min(...globalPoints.map((point) => dot(point, axes.v)));
    const normalCoordinate = dot(globalPoints[0], axes.normal);
    const origin3 = add(add(scale(axes.u, minimumU), scale(axes.v, minimumV)), scale(axes.normal, normalCoordinate));
    const basis = PLANE_BASIS[plane];
    const origin = { x: dot(origin3, basis.x), y: dot(origin3, basis.y) };
    const u = project(axes.u, plane);
    const v = project(axes.v, plane);
    return [{
      id: face.id,
      label: shortFaceId(face.id),
      origin,
      u,
      v,
      outOfPlane: u ? (v ? null : "v") : "u",
      locatorKind: locator.kind,
      // Keep the original sourceEntityId on both locator kinds for backwards
      // compatibility; sourceRegionId disambiguates region locators for new
      // selection filtering callers.
      sourceEntityId: locator.sourceEntityId,
      sourceRegionId: locator.kind === "profileRegion" ? locator.sourceEntityId : undefined,
      capSide: locator.kind === "profileRegion" ? locator.capSide : null,
      sourceSegment: locator.kind === "profileEdge"
        ? {
            start: { x: points[0][0], y: points[0][1] },
            end: { x: points[1][0], y: points[1][1] },
          }
        : undefined,
    }];
  });
}
