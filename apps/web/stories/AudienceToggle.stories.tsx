import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import AudienceToggle from "../components/AudienceToggle";
import type { Audience } from "@rosm/core/schemas";

const meta: Meta<typeof AudienceToggle> = {
  title: "Route System/AudienceToggle",
  component: AudienceToggle,
};
export default meta;

type Story = StoryObj<typeof AudienceToggle>;

function DefaultRender() {
  const [val, setVal] = useState<Audience>("humans");
  return <AudienceToggle value={val} onChange={setVal} />;
}
export const Default: Story = { render: () => <DefaultRender /> };

function DogsRender() {
  const [val, setVal] = useState<Audience>("dogs");
  return <AudienceToggle value={val} onChange={setVal} />;
}
export const DogsSelected: Story = { render: () => <DogsRender /> };

function BothRender() {
  const [val, setVal] = useState<Audience>("both");
  return <AudienceToggle value={val} onChange={setVal} />;
}
export const BothSelected: Story = { render: () => <BothRender /> };
