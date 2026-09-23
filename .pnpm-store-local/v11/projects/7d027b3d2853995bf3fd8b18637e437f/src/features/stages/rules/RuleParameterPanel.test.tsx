import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuleParameterPanel } from "./RuleParameterPanel";

describe("RuleParameterPanel", () => {
  it("shows compact declared and predeclared parameter lists before opening the form", () => {
    const markup = renderToStaticMarkup(
      <RuleParameterPanel
        pendingParameters={[]}
        existingParameters={[]}
        predeclaredParameters={[]}
        canCreateParameters={true}
        newRuleParameter={{
          id: "",
          displayName: "",
          valueType: "number",
          unit: "mm",
          default: 100,
          minimum: 0,
          maximum: 1000,
        }}
        setNewRuleParameter={() => undefined}
        ruleParameterError=""
        addRuleParameter={() => true}
        resetNewRuleParameter={() => undefined}
      />,
    );

    expect(markup).toContain("已声明参数");
    expect(markup).toContain("预声明参数");
    expect(markup).toContain("新增预声明参数");
    expect(markup).not.toContain("最小值");
    expect(markup).not.toContain("标称值");
  });
});
