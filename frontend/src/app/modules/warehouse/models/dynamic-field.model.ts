export interface DynamicFieldDefinition {
    id?: number;
    warehouse?: number | null;
    name: string;
    label: string;
    field_type: 'text' | 'number' | 'boolean' | 'date';
    default_value?: string | null;
    is_required: boolean;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
    created_by?: number | null;
    created_by_name?: string | null;
}
