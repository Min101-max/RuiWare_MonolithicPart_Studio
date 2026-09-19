import { useState } from "react";
import { Plus, Variable, X } from "lucide-react";
import { Field, NumberInput, PanelTitle } from "../../../components/ui/FormParts";
import type { ParameterDefinition } from "../../../types";

export type NewRuleParameter = {
  id: string;
  displayName: string;
  valueType: "number" | "integer";
  unit: string;
  default: number;
  minimum: number;
  maximum: number;
};

type Props = {
  pendingParameters: ParameterDefinition[];
  existingParameters: ParameterDefinition[];
  predeclaredParameters: ParameterDefinition[];
  canCreateParameters: boolean;
  newRuleParameter: NewRuleParameter;
  setNewRuleParameter: (value: NewRuleParameter) => void;
  ruleParameterError: string;
  addRuleParameter: () => boolean;
  resetNewRuleParameter: () => void;
};

function ParameterList({
  parameters,
  emptyText,
}: {
  parameters: ParameterDefinition[];
  emptyText: string;
}) {
  if (parameters.length === 0) {
    return <p className="rule-parameter-empty">{emptyText}</p>;
  }

  return (
    <div className="rule-parameter-rows">
      {parameters.map((parameter) => (
        <div className="rule-parameter-row" key={parameter.id}>
          <code>{parameter.id}</code>
          <span>{parameter.displayName || parameter.label || parameter.id}</span>
        </div>
      ))}
    </div>
  );
}

export function RuleParameterPanel({
  pendingParameters,
  existingParameters,
  predeclaredParameters,
  canCreateParameters,
  newRuleParameter,
  setNewRuleParameter,
  ruleParameterError,
  addRuleParameter,
  resetNewRuleParameter,
}: Props) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const closeCreateDialog = () => {
    setIsCreateDialogOpen(false);
    resetNewRuleParameter();
  };
  const openCreateDialog = () => {
    resetNewRuleParameter();
    setIsCreateDialogOpen(true);
  };
  const completeNewRuleParameter = () => {
    if (addRuleParameter()) setIsCreateDialogOpen(false);
  };

  return (
    <>
      <div className="panel rule-parameter-panel">
        <PanelTitle
          icon={Variable}
          title="规则参数"
          subtitle="表达式只使用参数 ID；在此预声明的参数进入契约页后再补全正式数据。"
          actions={
            <span className={`review-chip ${pendingParameters.length ? "" : "ok"}`}>
              {pendingParameters.length ? `${pendingParameters.length} 个待补全` : "已补全"}
            </span>
          }
        />
        <div className="rule-parameter-lists">
          <section className="rule-parameter-list" aria-labelledby="existing-parameter-title">
            <header>
              <strong id="existing-parameter-title">已声明参数</strong>
              <span>{existingParameters.length}</span>
            </header>
            <ParameterList parameters={existingParameters} emptyText="契约页尚无已声明参数。" />
          </section>
          <section className="rule-parameter-list" aria-labelledby="predeclared-parameter-title">
            <header>
              <strong id="predeclared-parameter-title">预声明参数</strong>
              <button
                className="icon-btn"
                title={canCreateParameters ? "新增预声明参数" : "请先新建规则"}
                aria-label="新增预声明参数"
                onClick={openCreateDialog}
                disabled={!canCreateParameters}
              >
                <Plus size={14} />
              </button>
            </header>
            <ParameterList parameters={predeclaredParameters} emptyText="尚未预声明参数。" />
          </section>
        </div>
      </div>

      {isCreateDialogOpen && (
        <div className="dialog-scrim" role="presentation" onPointerDown={closeCreateDialog}>
          <section
            className="rule-parameter-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-parameter-dialog-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="rule-parameter-dialog-header">
              <div>
                <h2 id="rule-parameter-dialog-title">新增预声明参数</h2>
                <p>该参数立即可在规则表达式中用参数 ID 引用，契约页再补全来源和发布要求。</p>
              </div>
              <button className="icon-btn" title="关闭" aria-label="关闭" onClick={closeCreateDialog}>
                <X size={14} />
              </button>
            </header>
            <div className="form-grid three">
              <Field label="参数 ID">
                <input
                  value={newRuleParameter.id}
                  onChange={(event) =>
                    setNewRuleParameter({ ...newRuleParameter, id: event.target.value })
                  }
                  placeholder="holePitch"
                />
              </Field>
              <Field label="显示名称">
                <input
                  value={newRuleParameter.displayName}
                  onChange={(event) =>
                    setNewRuleParameter({ ...newRuleParameter, displayName: event.target.value })
                  }
                  placeholder="孔距"
                />
              </Field>
              <Field label="类型">
                <select
                  value={newRuleParameter.valueType}
                  onChange={(event) => {
                    const valueType = event.target.value as "number" | "integer";
                    const integerValues = valueType === "integer";
                    setNewRuleParameter({
                      ...newRuleParameter,
                      valueType,
                      default: integerValues
                        ? Math.trunc(newRuleParameter.default)
                        : newRuleParameter.default,
                      minimum: integerValues
                        ? Math.trunc(newRuleParameter.minimum)
                        : newRuleParameter.minimum,
                      maximum: integerValues
                        ? Math.trunc(newRuleParameter.maximum)
                        : newRuleParameter.maximum,
                    });
                  }}
                >
                  <option value="number">数值</option>
                  <option value="integer">整数</option>
                </select>
              </Field>
              <Field label="单位">
                <input
                  value={newRuleParameter.unit}
                  onChange={(event) =>
                    setNewRuleParameter({ ...newRuleParameter, unit: event.target.value })
                  }
                  placeholder="mm"
                />
              </Field>
              <Field label="最小值">
                <NumberInput
                  value={newRuleParameter.minimum}
                  onChange={(minimum) =>
                    setNewRuleParameter({ ...newRuleParameter, minimum })
                  }
                />
              </Field>
              <Field label="标称值">
                <NumberInput
                  value={newRuleParameter.default}
                  onChange={(value) =>
                    setNewRuleParameter({ ...newRuleParameter, default: value })
                  }
                />
              </Field>
              <Field label="最大值">
                <NumberInput
                  value={newRuleParameter.maximum}
                  onChange={(maximum) =>
                    setNewRuleParameter({ ...newRuleParameter, maximum })
                  }
                />
              </Field>
            </div>
            {ruleParameterError && <p className="inline-error">{ruleParameterError}</p>}
            <footer className="rule-parameter-dialog-actions">
              <button className="secondary" onClick={closeCreateDialog}>取消</button>
              <button className="primary" onClick={completeNewRuleParameter}>
                <Plus size={13} />
                完成
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
