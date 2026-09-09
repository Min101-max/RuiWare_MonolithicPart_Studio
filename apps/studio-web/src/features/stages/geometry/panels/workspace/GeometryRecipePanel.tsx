import {
  Box,
  Braces,
  CheckCircle2,
  CircleAlert,
  Copy,
  Layers3,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Draft, GeometryRecipe, SemanticFaceLocator } from "../../../../../types";
import { Field, NumberInput, PanelTitle } from "../../../../../components/ui/FormParts";

const csv = (value: string) =>
  value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

const PROFILE_LOCATOR_OPERATORS = new Set([
  "profile.open_profile_tube_extrude",
  "sketch.region_extrude",
]);

const isProfileLocatorOperation = (operator: string) =>
  PROFILE_LOCATOR_OPERATORS.has(operator);

type SemanticFaceLocatorPatch = Partial<{
  operationId: string;
  profileSketchId: string;
  sourceEntityId: string;
  capSide: "start" | "end";
}>;

type GeometryRecipePanelProps = {
  draft: Draft;
  recipe: GeometryRecipe;
  setRecipe: (patch: Partial<GeometryRecipe>) => void;
  editOp: (
    index: number,
    patch: Partial<GeometryRecipe["operations"][number]>,
  ) => void;
  addOp: () => void;
  editSemanticFace: (
    index: number,
    patch: Partial<GeometryRecipe["semanticFaces"][number]>,
  ) => void;
  addSemanticFace: () => void;
  pendingProfileMode: Draft["sketch"]["profileMode"] | null;
  setPendingProfileMode: (
    value: Draft["sketch"]["profileMode"] | null,
  ) => void;
  applyProfileMode: (reset: boolean) => void;
  operators: readonly (readonly [string, string, string])[];
  operatorStatus: (operator: string) => string;
  operatorDefaults: (
    operator: string,
  ) => Pick<
    GeometryRecipe["operations"][number],
    "arguments" | "argumentExpressions" | "sourceRefs"
  >;
};

export function GeometryRecipePanel({
  draft,
  recipe,
  setRecipe,
  editOp,
  addOp,
  editSemanticFace,
  addSemanticFace,
  pendingProfileMode,
  setPendingProfileMode,
  applyProfileMode,
  operators,
  operatorStatus,
  operatorDefaults,
}: GeometryRecipePanelProps) {
  return (
    <>
      <div className="panel geometry-recipe-panel">
        <PanelTitle
          icon={Braces}
          title="4. 几何配方"
          subtitle="按顺序构造基体。拉伸只是其中一种方式，也可扩展旋转、扫掠、放样、钣金和外部派生。"
          actions={
            <button className="mini-btn" onClick={addOp}>
              <Plus size={14} />
              添加算子
            </button>
          }
        />
        <div className="form-grid three">
          <Field label="构造方式">
            <select
              value={recipe.constructionMode}
              onChange={(e) =>
                setRecipe({
                  constructionMode: e.target
                    .value as GeometryRecipe["constructionMode"],
                  reviewed: false,
                })
              }
            >
              {[
                ["extrude", "拉伸"],
                ["revolve", "旋转"],
                ["sweep", "扫掠"],
                ["loft", "放样"],
                ["sheetMetal", "钣金"],
                ["coldRollForming", "冷弯成形"],
                ["machinedStock", "毛坯机加工"],
                ["externalDerived", "外部派生"],
                ["standardParametric", "标准参数件"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="草图引用">
            <input
              value={recipe.sketches.join(", ")}
              onChange={(e) => setRecipe({ sketches: csv(e.target.value) })}
            />
          </Field>
          <Field label="路径引用">
            <input
              value={recipe.paths.join(", ")}
              onChange={(e) => setRecipe({ paths: csv(e.target.value) })}
            />
          </Field>
        </div>
        <div className="operation-list">
          {recipe.operations.map((op, index) => (
            <div className="operation-card" key={`${op.id}-${index}`}>
              <div className="order-index">{index + 1}</div>
              <div className="operation-main">
                <div className="form-grid two">
                  <Field label="稳定 ID">
                    <input
                      value={op.id}
                      onChange={(e) => editOp(index, { id: e.target.value })}
                    />
                  </Field>
                  <Field label="几何算子">
                    <select
                      value={op.operator}
                      onChange={(e) => {
                        const operator = e.target.value;
                        editOp(index, { operator, ...operatorDefaults(operator) });
                      }}
                    >
                      {operators.map(([value, label, status]) => (
                        <option key={value} value={value} disabled={status !== "available"}>
                          {label}
                          {status === "available" ? "" : "（待实现）"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className={`operator-capability ${operatorStatus(op.operator)}`}>
                  {operatorStatus(op.operator) === "available" ? (
                    <>
                      <CheckCircle2 size={13} />
                      <span>CAD内核已实现，可参与编译和边界工况验证。</span>
                    </>
                  ) : (
                    <>
                      <CircleAlert size={13} />
                      <span>当前仅保留元模型能力，缺少专用引用编辑器、CAD算子和验证器，不能作为可发布模板使用。</span>
                    </>
                  )}
                </div>
                {op.operator === "solid.revolve" && (
                  <div className="operator-special-form">
                    <strong>旋转轴与角度</strong>
                    <div className="form-grid three">
                      {[
                        ["axisOriginU", "轴原点 U"],
                        ["axisOriginV", "轴原点 V"],
                        ["angleDegrees", "旋转角度"],
                      ].map(([key, label]) => (
                        <Field key={key} label={label}>
                          <NumberInput
                            unit={key === "angleDegrees" ? "°" : "mm"}
                            value={Number(op.arguments[key] ?? 0)}
                            onChange={(value) =>
                              editOp(index, { arguments: { ...op.arguments, [key]: value } })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <div className="form-grid two">
                      {[
                        ["axisDirectionU", "轴方向 U"],
                        ["axisDirectionV", "轴方向 V"],
                      ].map(([key, label]) => (
                        <Field key={key} label={label}>
                          <NumberInput
                            unit=""
                            step={0.1}
                            value={Number(op.arguments[key] ?? 0)}
                            onChange={(value) =>
                              editOp(index, { arguments: { ...op.arguments, [key]: value } })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <small>U/V对应当前截面平面的水平轴和垂直轴；截面不得跨越旋转轴。</small>
                  </div>
                )}
                {op.operator === "solid.sweep" && (
                  <div className="operator-special-form">
                    <strong>三维扫掠路径</strong>
                    <div className="form-grid three">
                      <Field label="截面锚点"><select value={op.profileAnchor ?? "sketch.origin"} onChange={(e) => editOp(index, { profileAnchor: e.target.value })}><option value="sketch.origin">草图原点</option></select></Field>
                      <Field label="姿态"><select value={op.orientationMode ?? "minimumTwist"} onChange={(e) => editOp(index, { orientationMode: e.target.value as "followPath" | "fixedWorld" | "minimumTwist" })}><option value="followPath">跟随路径</option><option value="fixedWorld">固定世界方向</option><option value="minimumTwist">最小扭转 / 平行传输</option></select></Field>
                      <Field label="拐角"><select value={op.cornerMode ?? "right"} onChange={(e) => editOp(index, { cornerMode: e.target.value as "right" })}><option value="right">RightCorner</option></select></Field>
                    </div>
                    <div className="form-grid two"><Field label="缩放"><select value={op.scaleMode ?? "constant"} onChange={(e) => editOp(index, { scaleMode: e.target.value as "constant" })}><option value="constant">恒定</option></select></Field><Field label="扭转"><select value={op.twistMode ?? "none"} onChange={(e) => editOp(index, { twistMode: e.target.value as "none" })}><option value="none">关闭</option></select></Field></div>
                    <Field
                      label="路径点表达式"
                      hint="x:y:z；使用分号分隔节点，可直接引用模板参数。例如 0:0:0;0:0:length"
                    >
                      <textarea
                        value={String(op.arguments.pathPoints ?? "")}
                        onChange={(e) =>
                          editOp(index, { arguments: { ...op.arguments, pathPoints: e.target.value } })
                        }
                      />
                    </Field>
                    <small>路径必须连续、无零长段；当前使用折线路径并要求首段与截面平面法向一致。</small>
                  </div>
                )}
                {op.operator === "solid.loft" && (
                  <div className="operator-special-form">
                    <strong>放样截面站</strong>
                    <Field
                      label="位置与缩放表达式"
                      hint="法向位置:截面缩放；至少两站且位置递增。例如 0:1;length*0.5:0.7;length:1.2"
                    >
                      <textarea
                        value={String(op.arguments.stations ?? "")}
                        onChange={(e) =>
                          editOp(index, { arguments: { ...op.arguments, stations: e.target.value } })
                        }
                      />
                    </Field>
                    <small>每个站复用同一受约束截面拓扑；多环截面的内外环会分别放样并完成减材。</small>
                  </div>
                )}
                {op.operator === "sheet.bend" && (
                  <div className="operator-special-form">
                    <strong>单折弯定义</strong>
                    <div className="form-grid two">
                      <Field label="折弯角度">
                        <NumberInput
                          unit="°"
                          value={Number(op.arguments.bendAngleDegrees ?? 90)}
                          onChange={(value) =>
                            editOp(index, { arguments: { ...op.arguments, bendAngleDegrees: value } })
                          }
                        />
                      </Field>
                      <Field label="折弯位置表达式">
                        <input
                          value={op.argumentExpressions.bendPosition ?? ""}
                          onChange={(e) =>
                            editOp(index, { argumentExpressions: { ...op.argumentExpressions, bendPosition: e.target.value } })
                          }
                        />
                      </Field>
                      <Field label="内圆角表达式">
                        <input
                          value={op.argumentExpressions.insideRadius ?? ""}
                          onChange={(e) =>
                            editOp(index, { argumentExpressions: { ...op.argumentExpressions, insideRadius: e.target.value } })
                          }
                        />
                      </Field>
                      <Field label="K因子">
                        <NumberInput
                          unit=""
                          step={0.01}
                          value={Number(op.arguments.kFactor ?? 0.42)}
                          onChange={(value) =>
                            editOp(index, { arguments: { ...op.arguments, kFactor: value } })
                          }
                        />
                      </Field>
                    </div>
                    <small>按照内圆角、厚度和K因子计算中性层折弯展开量；当前实现单条贯穿宽度的直线折弯，保持单一实体。</small>
                  </div>
                )}
                <Field
                  label="参数表达式"
                  hint="格式：参数名=表达式；多个用逗号分隔"
                >
                  <input
                    value={Object.entries(op.argumentExpressions)
                      .map(([key, value]) => `${key}=${value}`)
                      .join(", ")}
                    onChange={(e) =>
                      editOp(index, {
                        argumentExpressions: Object.fromEntries(
                          csv(e.target.value)
                            .map((item: string) => {
                              const [key, ...rest] = item.split("=");
                              return [key.trim(), rest.join("=").trim()] as const;
                            })
                            .filter(([key, value]: readonly [string, string]) => key && value),
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="条件">
                  <input
                    value={op.conditionExpression}
                    onChange={(e) =>
                      editOp(index, { conditionExpression: e.target.value })
                    }
                  />
                </Field>
              </div>
              <button
                className="delete-icon"
                title="删除算子"
                onClick={() => {
                  const deletedOperationId = op.id;
                  setRecipe({
                    operations: recipe.operations.filter((_, currentIndex) => currentIndex !== index),
                    semanticFaces: recipe.semanticFaces.map((face) =>
                      face.locator?.operationId === deletedOperationId
                        ? { ...face, locator: null }
                        : face,
                    ),
                  });
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <section className="semantic-face-contract panel">
          <PanelTitle
            icon={Box}
            title="几何语义面"
            subtitle="规则仍通过语义面 ID 引用；语义面内部由来源轮廓边定位真实面，再用局部 U/V 表达端距和阵列范围。"
            actions={
              <button className="mini-btn" onClick={addSemanticFace}>
                <Plus size={14} />
                新增语义面
              </button>
            }
          />
          <div className="semantic-face-responsibilities" role="note">
            <span><strong>来源轮廓边：</strong>决定是哪一个面</span>
            <span><strong>局部坐标系：</strong>决定 U/V 方向</span>
            <span><strong>U/V 边界：</strong>决定面内有效范围</span>
          </div>
          {recipe.semanticFaces.map((face, index) => {
            const locator = face.locator ?? null;
            const locatorOperations = recipe.operations.filter((operation) =>
              isProfileLocatorOperation(operation.operator),
            );
            const selectedLocatorOperation = locator
              ? recipe.operations.find((operation) => operation.id === locator.operationId)
              : undefined;
            const profileSketchOptions = Array.from(
              new Set([
                ...recipe.sketches,
                selectedLocatorOperation?.profileSketchId,
                locator?.profileSketchId,
              ].filter((value): value is string => Boolean(value))),
            );
            const profileEdgeOptions = draft.sketch.entities
              .filter(
                (entity) =>
                  !entity.construction &&
                  entity.geometryType !== "point",
              )
              .map((entity) => ({ id: entity.id, label: entity.role }));
            const profileRegionOptions = draft.sketch.regions
              .filter((region) => region.closed)
              .map((region) => ({ id: region.id, label: region.role }));
            const sourceEntityOptions =
              locator?.kind === "profileRegion"
                ? profileRegionOptions
                : profileEdgeOptions;
            const sourceSketchEntity = locator?.kind === "profileEdge"
              ? draft.sketch.entities.find((entity) => entity.id === locator.sourceEntityId)
              : undefined;
            const sourceRegion = locator?.kind === "profileRegion"
              ? draft.sketch.regions.find((region) => region.id === locator.sourceEntityId)
              : undefined;
            const sourceEntity = sourceSketchEntity || sourceRegion;
            const sourceEntityMissing = Boolean(
              locator &&
              !sourceEntity,
            );
            const sourceEntityCannotGenerate = Boolean(
              locator &&
              (locator.kind === "profileEdge"
                ? sourceSketchEntity &&
                  (sourceSketchEntity.construction ||
                    sourceSketchEntity.geometryType !== "line" ||
                    !draft.sketch.regions.some(
                      (region) =>
                        region.closed &&
                        region.operation === "add" &&
                        region.boundaryRefs.includes(locator.sourceEntityId),
                    ))
                : sourceRegion && (!sourceRegion.closed || sourceRegion.operation !== "add")),
            );
            const sourceEntityUseCount = locator
              ? locator.kind === "profileEdge"
                ? draft.sketch.regions.filter(
                    (region) =>
                      region.closed && region.boundaryRefs.includes(locator.sourceEntityId),
                  ).length
                : 1
              : 0;
            const sourceEntityAmbiguous = Boolean(
              locator && locator.kind === "profileEdge" && sourceEntityUseCount > 1,
            );
            const sourceEntityInvalid =
              sourceEntityMissing || sourceEntityCannotGenerate || sourceEntityAmbiguous;
            const sourceEntityLabel =
              locator?.kind === "profileRegion" ? "来源截面区域" : "来源轮廓边";
            const sourceEntityErrorId = `semantic-face-source-error-${index}`;
            const setLocatorKind = (kind: SemanticFaceLocator["kind"] | "") => {
              if (!kind) {
                editSemanticFace(index, { locator: null });
                return;
              }
              const operation =
                (locator && locatorOperations.find((item) => item.id === locator.operationId)) ||
                locatorOperations.find((item) => item.id === face.sourceOperationId) ||
                locatorOperations[0];
              if (!operation) return;
              const profileSketchId =
                (locator?.kind === kind && locator.profileSketchId) ||
                operation.profileSketchId ||
                operation.sourceRefs.find((ref) => ref.startsWith("sketch.")) ||
                recipe.sketches[0] ||
                "sketch.section.main";
              const sourceEntityId =
                locator?.kind === kind && locator.sourceEntityId
                  ? locator.sourceEntityId
                  : kind === "profileRegion"
                    ? profileRegionOptions[0]?.id || ""
                    : profileEdgeOptions[0]?.id || "";
              const nextLocator: SemanticFaceLocator =
                kind === "profileRegion"
                  ? {
                      kind,
                      operationId: operation.id,
                      profileSketchId,
                      sourceEntityId,
                      capSide:
                        locator?.kind === "profileRegion"
                          ? locator.capSide
                          : face.id === "part.endFace.end"
                            ? "end"
                            : "start",
                    }
                  : {
                      kind,
                      operationId: operation.id,
                      profileSketchId,
                      sourceEntityId,
                    };
              editSemanticFace(index, {
                sourceOperationId: operation.id,
                locator: nextLocator,
              });
            };
            const setLocator = (patch: SemanticFaceLocatorPatch) => {
              if (!locator) return;
              editSemanticFace(index, {
                locator: { ...locator, ...patch } as SemanticFaceLocator,
                ...(patch.operationId ? { sourceOperationId: patch.operationId } : {}),
              });
            };
            return (
            <div className="semantic-face-row" key={`${face.id}-${index}`}>
              <div className="semantic-face-identity">
                <Field label="稳定 ID">
                  <input
                    value={face.id}
                    onChange={(e) => editSemanticFace(index, { id: e.target.value })}
                  />
                </Field>
                <Field label="显示名称">
                  <input
                    value={face.label}
                    onChange={(e) =>
                      editSemanticFace(index, { label: e.target.value })
                    }
                  />
                </Field>
                <Field label="局部坐标系">
                  <select
                    value={face.hostFrame}
                    onChange={(e) =>
                      editSemanticFace(index, {
                        hostFrame: e.target.value as GeometryRecipe["semanticFaces"][number]["hostFrame"],
                      })
                    }
                  >
                    <option value="negativeY">−Y（U=X，V=Z）</option>
                    <option value="positiveY">+Y（U=X，V=Z）</option>
                    <option value="negativeX">−X（U=Y，V=Z）</option>
                    <option value="positiveX">+X（U=Y，V=Z）</option>
                    <option value="negativeZ">−Z（U=X，V=Y）</option>
                    <option value="positiveZ">+Z（U=X，V=Y）</option>
                  </select>
                </Field>
              </div>
              <fieldset className="semantic-face-locator">
                <legend>来源轮廓边绑定（可选）</legend>
                <Field
                  label="来源类型"
                  hint="profileEdge 生成纵向侧面；profileRegion 生成拉伸端面。"
                >
                  <select
                    value={locator?.kind ?? ""}
                    onChange={(event) =>
                      setLocatorKind(
                        event.target.value as SemanticFaceLocator["kind"] | "",
                      )
                    }
                  >
                    <option value="">未设置（兼容旧草稿）</option>
                    <option value="profileEdge" disabled={!profileEdgeOptions.length}>
                      profileEdge · 截面轮廓边
                    </option>
                    <option value="profileRegion" disabled={!profileRegionOptions.length}>
                      profileRegion · 截面区域
                    </option>
                  </select>
                </Field>
                {locator ? (
                  <>
                    <Field label="来源算子">
                      <select
                        value={locator.operationId}
                        onChange={(event) => setLocator({ operationId: event.target.value })}
                      >
                        {!locatorOperations.some((item) => item.id === locator.operationId) && (
                          <option value={locator.operationId}>
                            {locator.operationId}
                            {selectedLocatorOperation && !isProfileLocatorOperation(selectedLocatorOperation.operator)
                              ? "（旧草稿）"
                              : "（当前不可用）"}
                          </option>
                        )}
                        {locatorOperations.map((operation) => (
                          <option key={operation.id} value={operation.id}>
                            {operation.id} · {operation.operator}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="截面草图">
                      <select
                        value={locator.profileSketchId}
                        onChange={(event) => setLocator({ profileSketchId: event.target.value })}
                      >
                        {!profileSketchOptions.includes(locator.profileSketchId) && (
                          <option value={locator.profileSketchId}>{locator.profileSketchId}</option>
                        )}
                        {profileSketchOptions.map((sketchId) => (
                          <option key={sketchId} value={sketchId}>{sketchId}</option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={sourceEntityLabel}
                      hint="选项格式：稳定 ID · 工程名称"
                    >
                      <>
                        <select
                          value={locator.sourceEntityId}
                          aria-invalid={sourceEntityInvalid}
                          aria-describedby={sourceEntityInvalid ? sourceEntityErrorId : undefined}
                          data-semantic-face-id={face.id}
                          className={sourceEntityInvalid ? "semantic-source-select invalid" : "semantic-source-select"}
                          onChange={(event) => setLocator({ sourceEntityId: event.target.value })}
                        >
                          {sourceEntityMissing && (
                            <option value={locator.sourceEntityId}>
                              {locator.sourceEntityId
                                ? `${locator.sourceEntityId} · 来源不存在`
                                : "未选择来源（错误）"}
                            </option>
                          )}
                          {sourceEntityOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} · {item.label}
                            </option>
                          ))}
                        </select>
                        {sourceEntityInvalid && (
                          <small
                            id={sourceEntityErrorId}
                            className="field-error"
                            role="alert"
                          >
                            {sourceEntityMissing
                              ? locator.sourceEntityId
                                ? `${sourceEntityLabel}不存在：${locator.sourceEntityId}`
                                : `请选择${sourceEntityLabel}`
                              : sourceEntityCannotGenerate
                                ? `${sourceEntityLabel}无法生成面：当前仅支持闭合加材区域或直线轮廓边`
                                : `${sourceEntityLabel}一个定位器命中多个面：${locator.sourceEntityId}`}
                          </small>
                        )}
                      </>
                    </Field>
                    {locator.kind === "profileRegion" && (
                      <Field label="拉伸端面">
                        <select
                          value={locator.capSide}
                          onChange={(event) =>
                            setLocator({
                              capSide: event.target.value as "start" | "end",
                            })
                          }
                        >
                          <option value="start">起始端面</option>
                          <option value="end">终止端面</option>
                        </select>
                      </Field>
                    )}
                  </>
                ) : (
                  <small className="semantic-face-locator-legacy">
                    旧草稿未声明来源轮廓边；hostFrame 与 U/V 参数仍按原语义保留。
                  </small>
                )}
              </fieldset>
              <div className="semantic-face-bounds">
                <fieldset className="semantic-axis-group">
                  <legend>U 方向</legend>
                  <Field label="U 起始边界">
                    <code className="code-input">
                      <input
                        list="feature-parameter-options"
                        value={face.uStartExpression}
                        onChange={(e) =>
                          editSemanticFace(index, { uStartExpression: e.target.value })
                        }
                      />
                    </code>
                  </Field>
                  <Field label="U 跨度">
                    <code className="code-input">
                      <input
                        list="feature-parameter-options"
                        value={face.uSpanExpression}
                        onChange={(e) =>
                          editSemanticFace(index, { uSpanExpression: e.target.value })
                        }
                      />
                    </code>
                  </Field>
                </fieldset>
                <fieldset className="semantic-axis-group">
                  <legend>V 方向</legend>
                  <Field label="V 起始边界">
                    <code className="code-input">
                      <input
                        list="feature-parameter-options"
                        value={face.vStartExpression}
                        onChange={(e) =>
                          editSemanticFace(index, { vStartExpression: e.target.value })
                        }
                      />
                    </code>
                  </Field>
                  <Field label="V 跨度">
                    <code className="code-input">
                      <input
                        list="feature-parameter-options"
                        value={face.vSpanExpression}
                        onChange={(e) =>
                          editSemanticFace(index, { vSpanExpression: e.target.value })
                        }
                      />
                    </code>
                  </Field>
                </fieldset>
              </div>
              <button
                className="delete-icon"
                title="删除语义面"
                onClick={() =>
                  setRecipe({
                    semanticFaces: recipe.semanticFaces.filter((_, currentIndex) => currentIndex !== index),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            );
          })}
        </section>
        <label className="confirm-box">
          <input
            type="checkbox"
            checked={recipe.reviewed}
            onChange={(e) => setRecipe({ reviewed: e.target.checked })}
          />
          <span>
            <strong>几何配方已复核</strong>
            <small>确认算子顺序、引用、条件和语义输出。</small>
          </span>
        </label>
      </div>
      {pendingProfileMode && (
        <div
          className="dialog-scrim"
          role="presentation"
          onPointerDown={() => setPendingProfileMode(null)}
        >
          <section
            className="profile-mode-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-mode-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-icon">
              <Layers3 size={20} />
            </div>
            <div>
              <h2 id="profile-mode-title">
                切换为
                {pendingProfileMode === "closedRegion"
                  ? "单闭合区域"
                  : pendingProfileMode === "multiRegion"
                    ? "管材／多环多腔区域"
                    : "中心线＋厚度薄壁"}
              </h2>
              <p>
                建模模式定义如何解释截面区域。重建会整体替换图元、约束、尺寸和区域，旧模式的水平／垂直尺寸不会残留。
              </p>
            </div>
            <div className="mode-choice-grid">
              <button onClick={() => applyProfileMode(false)}>
                <Copy size={17} />
                <strong>仅切换解释</strong>
                <span>保留全部图元、约束和尺寸，适合已有草图需手工迁移时使用。</span>
              </button>
                <button className="recommended" onClick={() => applyProfileMode(true)}>
                <RefreshCw size={17} />
                <strong>重建并清理旧约束</strong>
                <span>
                  {pendingProfileMode === "multiRegion"
                    ? "用常用矩形管外环、内环和壁厚关系替换现有草图。"
                    : pendingProfileMode === "centerlineThinWall"
                      ? "用可编辑的开口 C 形中心线路径替换现有草图。"
                      : "用实心闭合外环替换现有草图。"}
                </span>
                <b>推荐用于初始建模</b>
              </button>
            </div>
            <button
              className="dialog-cancel"
              onClick={() => setPendingProfileMode(null)}
            >
              取消
            </button>
          </section>
        </div>
      )}
    </>
  );
}








