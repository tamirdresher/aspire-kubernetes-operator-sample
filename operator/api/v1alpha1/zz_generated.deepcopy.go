package v1alpha1

import "k8s.io/apimachinery/pkg/runtime"

func (in *Greeter) DeepCopyInto(out *Greeter) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	in.ObjectMeta.DeepCopyInto(&out.ObjectMeta)
	out.Spec = in.Spec
	out.Status = in.Status
	out.Status.LastReconciled = in.Status.LastReconciled
}

func (in *Greeter) DeepCopy() *Greeter {
	if in == nil {
		return nil
	}
	out := new(Greeter)
	in.DeepCopyInto(out)
	return out
}

func (in *Greeter) DeepCopyObject() runtime.Object {
	if c := in.DeepCopy(); c != nil {
		return c
	}
	return nil
}

func (in *GreeterList) DeepCopyInto(out *GreeterList) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	in.ListMeta.DeepCopyInto(&out.ListMeta)
	if in.Items != nil {
		out.Items = make([]Greeter, len(in.Items))
		for i := range in.Items {
			in.Items[i].DeepCopyInto(&out.Items[i])
		}
	}
}

func (in *GreeterList) DeepCopy() *GreeterList {
	if in == nil {
		return nil
	}
	out := new(GreeterList)
	in.DeepCopyInto(out)
	return out
}

func (in *GreeterList) DeepCopyObject() runtime.Object {
	if c := in.DeepCopy(); c != nil {
		return c
	}
	return nil
}
