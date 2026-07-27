package controllers

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	hellov1alpha1 "github.com/tamirdresher/part2-greeter-operator/operator/api/v1alpha1"
)

// GreeterReconciler reconciles a Greeter object.
type GreeterReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

func (r *GreeterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	var greeter hellov1alpha1.Greeter
	if err := r.Get(ctx, req.NamespacedName, &greeter); err != nil {
		if apierrors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	configMapName := fmt.Sprintf("greeting-%s", greeter.Spec.Name)
	message := fmt.Sprintf("Hello, %s!", greeter.Spec.Name)

	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      configMapName,
			Namespace: greeter.Namespace,
		},
	}

	operationResult, err := controllerutil.CreateOrUpdate(ctx, r.Client, configMap, func() error {
		if configMap.Data == nil {
			configMap.Data = map[string]string{}
		}
		configMap.Data["message"] = message
		return controllerutil.SetControllerReference(&greeter, configMap, r.Scheme)
	})
	if err != nil {
		return ctrl.Result{}, err
	}

	if operationResult != controllerutil.OperationResultNone || greeter.Status.ConfigMapName != configMapName || greeter.Status.Message != message {
		greeter.Status.ConfigMapName = configMapName
		greeter.Status.Message = message
		greeter.Status.LastReconciled = metav1.Now()
		if err := r.Status().Update(ctx, &greeter); err != nil {
			return ctrl.Result{}, err
		}
		logger.Info("updated greeter status", "configMap", configMapName)
	}

	return ctrl.Result{}, nil
}

func (r *GreeterReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&hellov1alpha1.Greeter{}).
		Owns(&corev1.ConfigMap{}).
		Complete(r)
}
