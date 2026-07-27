package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// GreeterSpec describes the greeting to materialize.
type GreeterSpec struct {
	Name string `json:"name"`
}

// GreeterStatus reports the last ConfigMap reconciled for a Greeter.
type GreeterStatus struct {
	ConfigMapName  string      `json:"configMapName,omitempty"`
	Message        string      `json:"message,omitempty"`
	LastReconciled metav1.Time `json:"lastReconciled,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status

// Greeter is the Schema for the greeters API.
type Greeter struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   GreeterSpec   `json:"spec,omitempty"`
	Status GreeterStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// GreeterList contains a list of Greeter.
type GreeterList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Greeter `json:"items"`
}
