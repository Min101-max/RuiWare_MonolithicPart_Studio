import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Draft, GeometryRecipe } from "../../../../../types";
import { GeometryRecipePanel } from "./GeometryRecipePanel";

type TestElementProps = Record<string, unknown> & { children?: ReactNode };
type FacePatch = Partial<GeometryRecipe["semanticFaces"][number]>;

const draft = {
  sketch: {
    profileMode: "closedRegion",
    entities: [
      {
        id: "edge.outer",
        role: "外侧后壁",
        geometryType: "line",
        construction: false,
      },
      {
        id: "edge.inner",
        role: "内侧后壁",
        geometryType: "line",
        construction: false,
      },
      {
        id: "edge.free",
        role: "开放轮廓边",
        geometryType: "line",
        construction: false,
      },
      {
        id: "edge.construction",
        role: "构造辅助线",
        geometryType: "line",
        construction: true,
      },
    ],
    regions: [
      {
        id: "region.material",
        role: "主体闭合区域",
        boundaryRefs: ["edge.outer", "edge.inner"],
        closed: true,
        operation: "add",
      },
      {
        id: "region.void",
        role: "减材闭合区域",
        boundaryRefs: ["edge.inner"],
        closed: true,
        operation: "subtract",
      },
      {
        id: "region.open",
        role: "开放区域",
        boundaryRefs: ["edge.free"],
        closed: false,
        operation: "add",
      },
    ],
  },
} as unknown as Draft;

const profileEdgeFace = (
  id: string,
  label: string,
  sourceEntityId: string,
  uStartExpression: string,
): GeometryRecipe["semanticFaces"][number] => ({
  id,
  label,
  hostFrame: "positiveY",
  sourceOperationId: "body.main",
  locator: {
    kind: "profileEdge",
    operationId: "body.main",
    profileSketchId: "sketch.section.main",
    sourceEntityId,
  },
  uStartExpression,
  uSpanExpression: "sectionWidth",
  vStartExpression: "0",
  vSpanExpression: "length",
});

const recipe: GeometryRecipe = {
  id: "geometry.main",
  constructionMode: "extrude",
  sketches: ["sketch.section.main"],
  paths: [],
  operations: [
    {
      id: "body.main",
      operator: "profile.open_profile_tube_extrude",
      sourceRefs: ["sketch.section.main"],
      arguments: {},
      argumentExpressions: { length: "length" },
      conditionExpression: "True",
      semanticOutputs: ["part.body"],
      profileSketchId: "sketch.section.main",
    },
  ],
  semanticFaces: [
    profileEdgeFace("part.face.outerBack", "外侧后语义面", "edge.free", "outerStart"),
    profileEdgeFace("part.face.innerBack", "内侧后语义面", "edge.inner", "innerStart"),
    {
      id: "part.endFace.start",
      label: "起始端面",
      hostFrame: "negativeZ",
      sourceOperationId: "body.main",
      locator: {
        kind: "profileRegion",
        operationId: "body.main",
        profileSketchId: "sketch.section.main",
        sourceEntityId: "region.material",
        capSide: "start",
      },
      uStartExpression: "-sectionWidth / 2",
      uSpanExpression: "sectionWidth",
      vStartExpression: "-sectionHeight / 2",
      vSpanExpression: "sectionHeight",
    },
  ],
  reviewed: false,
};

const descendants = (node: ReactNode) => {
  const result: ReactElement<TestElementProps>[] = [];
  const visit = (current: ReactNode) => {
    Children.forEach(current, (child) => {
      if (!isValidElement<TestElementProps>(child)) return;
      result.push(child);
      visit(child.props.children);
    });
  };
  visit(node);
  return result;
};

const panel = (
  currentRecipe: GeometryRecipe,
  editSemanticFace: (index: number, patch: FacePatch) => void = () => undefined,
) =>
  GeometryRecipePanel({
    draft,
    recipe: currentRecipe,
    setRecipe: () => undefined,
    editOp: () => undefined,
    addOp: () => undefined,
    editSemanticFace,
    addSemanticFace: () => undefined,
    pendingProfileMode: null,
    setPendingProfileMode: () => undefined,
    applyProfileMode: () => undefined,
    operators: [
      ["profile.open_profile_tube_extrude", "通用截面拉伸", "available"],
    ],
    operatorStatus: () => "available",
    operatorDefaults: () => ({
      sourceRefs: ["sketch.section.main"],
      arguments: {},
      argumentExpressions: { length: "length" },
    }),
  });

const sourceSelect = (tree: ReactNode, faceId: string) => {
  const select = descendants(tree).find(
    (element) =>
      element.type === "select" &&
      element.props["data-semantic-face-id"] === faceId,
  );
  expect(select, `missing source selector for ${faceId}`).toBeDefined();
  return select!;
};

describe("GeometryRecipePanel semantic face source selector", () => {
  it("lists authored stable IDs with engineering names and marks a missing source", () => {
    const tree = panel(recipe);
    const markup = renderToStaticMarkup(tree);
    const text = markup.replace(/<[^>]+>/g, "");

    expect(sourceSelect(tree, "part.face.outerBack").props.value).toBe("edge.free");
    expect(sourceSelect(tree, "part.endFace.start").props.value).toBe("region.material");
    expect(text).toContain("edge.outer · 外侧后壁");
    expect(text).toContain("edge.inner · 内侧后壁");
    expect(text).toContain("edge.free · 开放轮廓边");
    expect(text).not.toContain("edge.construction · 构造辅助线");
    expect(text).toContain("region.material · 主体闭合区域");
    expect(text).toContain("region.void · 减材闭合区域");
    expect(text).not.toContain("region.open · 开放区域");
    expect(text).toContain("来源轮廓边无法生成面");
    expect(text).toContain("一个定位器命中多个面");
    expect(text).toContain("来源轮廓边：决定是哪一个面");
    expect(text).toContain("局部坐标系：决定 U/V 方向");
    expect(text).toContain("U/V 边界：决定面内有效范围");

    const missingRecipe: GeometryRecipe = {
      ...recipe,
      semanticFaces: recipe.semanticFaces.map((face, index) =>
        index === 0 && face.locator?.kind === "profileEdge"
          ? {
              ...face,
              locator: { ...face.locator, sourceEntityId: "edge.deleted" },
            }
          : face,
      ),
    };
    const missingTree = panel(missingRecipe);
    const missingSelect = sourceSelect(missingTree, "part.face.outerBack");
    const missingText = renderToStaticMarkup(missingTree).replace(/<[^>]+>/g, "");

    expect(missingSelect.props["aria-invalid"]).toBe(true);
    expect(missingText).toContain("来源轮廓边不存在：edge.deleted");
  });

  it("binds two positiveY faces to different sourceEntityIds without changing hostFrame or U/V", () => {
    const edits: Array<[number, FacePatch]> = [];
    const tree = panel(recipe, (index, patch) => edits.push([index, patch]));
    const outerSelect = sourceSelect(tree, "part.face.outerBack");
    const innerSelect = sourceSelect(tree, "part.face.innerBack");
    const choose = (select: ReactElement<TestElementProps>, value: string) =>
      (select.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value },
      });

    choose(outerSelect, "edge.outer");
    choose(innerSelect, "edge.inner");

    const nextFaces = recipe.semanticFaces.map((face) => ({ ...face }));
    for (const [index, patch] of edits) {
      nextFaces[index] = { ...nextFaces[index], ...patch };
      expect(patch).not.toHaveProperty("hostFrame");
      expect(patch).not.toHaveProperty("uStartExpression");
      expect(patch).not.toHaveProperty("uSpanExpression");
      expect(patch).not.toHaveProperty("vStartExpression");
      expect(patch).not.toHaveProperty("vSpanExpression");
    }

    expect(nextFaces[0]).toMatchObject({
      hostFrame: "positiveY",
      uStartExpression: "outerStart",
      uSpanExpression: "sectionWidth",
      vStartExpression: "0",
      vSpanExpression: "length",
      locator: { sourceEntityId: "edge.outer" },
    });
    expect(nextFaces[1]).toMatchObject({
      hostFrame: "positiveY",
      uStartExpression: "innerStart",
      uSpanExpression: "sectionWidth",
      vStartExpression: "0",
      vSpanExpression: "length",
      locator: { sourceEntityId: "edge.inner" },
    });

    const rerendered = panel({ ...recipe, semanticFaces: nextFaces });
    expect(sourceSelect(rerendered, "part.face.outerBack").props.value).toBe("edge.outer");
    expect(sourceSelect(rerendered, "part.face.innerBack").props.value).toBe("edge.inner");
  });
});
