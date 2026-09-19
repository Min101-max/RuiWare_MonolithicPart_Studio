import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractStage } from "./ContractStage";
import type { Draft } from "../../../types";

describe("ContractStage", () => {
  it("does not render the redundant parameter assistance panel", () => {
    const draft = {
      parameterDefinitions: [],
      interfaces: [],
      variants: [],
    } as unknown as Draft;

    const markup = renderToStaticMarkup(
      <ContractStage
        draft={draft}
        change={() => undefined}
        save={async () => draft}
        dirty={false}
        showError={() => undefined}
      />,
    );

    expect(markup).not.toContain("参数辅助");
  });
});
