import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import DispenserToggle from "../components/DispenserToggle";
import type { Dispenser } from "@rosm/core/schemas";

const meta: Meta<typeof DispenserToggle> = {
  title: "Route System/DispenserToggle",
  component: DispenserToggle,
};
export default meta;

type Story = StoryObj<typeof DispenserToggle>;

function BubblerRender() {
  const [val, setVal] = useState<Dispenser>("bubbler");
  return <DispenserToggle value={val} onChange={setVal} />;
}
export const Bubbler: Story = { render: () => <BubblerRender /> };

function BottleFillerRender() {
  const [val, setVal] = useState<Dispenser>("bottle");
  return <DispenserToggle value={val} onChange={setVal} />;
}
export const BottleFiller: Story = { render: () => <BottleFillerRender /> };

function BothRender() {
  const [val, setVal] = useState<Dispenser>("both");
  return <DispenserToggle value={val} onChange={setVal} />;
}
export const Both: Story = { render: () => <BothRender /> };
