import type { Meta, StoryObj } from "@storybook/react";
import type { EditExtras } from "@rosm/core/schemas";
import PointDetailsForm from "../components/PointDetailsForm";

const meta: Meta<typeof PointDetailsForm> = {
  title: "Route System/PointDetailsForm",
  component: PointDetailsForm,
};
export default meta;

type Story = StoryObj<typeof PointDetailsForm>;

export const WorkingForm: Story = {
  args: {
    tags: { amenity: "drinking_water", name: "Central Park Fountain" },
    busy: false,
    submitLabel: "Confirm working",
    onSubmit: (extras?: EditExtras) => console.log("Submit working", extras),
  },
};

export const WorkingButBrokenForm: Story = {
  args: {
    tags: { amenity: "drinking_water", name: "Prospect Park Fountain" },
    busy: false,
    submitLabel: "Mark working but broken",
    isBroken: true,
    onSubmit: (extras?: EditExtras) => console.log("Submit broken", extras),
  },
};

export const OutOfOrderForm: Story = {
  args: {
    tags: { amenity: "drinking_water", name: "High Line Fountain" },
    busy: false,
    submitLabel: "Mark out of order",
    isOutOfOrder: true,
    onSubmit: (extras?: EditExtras) => console.log("Submit out of order", extras),
  },
};

export const RemovedForm: Story = {
  args: {
    tags: { amenity: "drinking_water" },
    busy: false,
    submitLabel: "Confirm removed",
    isRemoved: true,
    onSubmit: (extras?: EditExtras) => console.log("Submit removed", extras),
  },
};
