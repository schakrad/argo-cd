package commands

import (
	"fmt"
	"sort"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/argoproj/gitops-engine/pkg/health"
	"k8s.io/apimachinery/pkg/util/duration"

	"github.com/argoproj/argo-cd/v2/pkg/apis/application/v1alpha1"
)

const (
	firstElemPrefix = `├─`
	lastElemPrefix  = `└─`
	pipe            = `│ `
)

func extractHealthStatusAndReason(node v1alpha1.ResourceNode) (healthStatus health.HealthStatusCode, reason string) {
	if node.Health != nil {
		healthStatus = node.Health.Status
		reason = node.Health.Message
	}
	return
}

func treeViewAppGet(prefix string, uidToNodeMap map[string]v1alpha1.ResourceNode, parentToChildMap map[string][]string, parent v1alpha1.ResourceNode, mapNodeNameToResourceState map[string]*resourceState, w *tabwriter.Writer) {
	healthStatus, _ := extractHealthStatusAndReason(parent)
	if mapNodeNameToResourceState[parent.Kind+"/"+parent.Name] != nil {
		value := mapNodeNameToResourceState[parent.Kind+"/"+parent.Name]
		_, _ = fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\n", printPrefix(prefix), parent.Kind+"/"+value.Name, value.Status, value.Health, value.Message)
	} else {
		_, _ = fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\n", printPrefix(prefix), parent.Kind+"/"+parent.Name, "", healthStatus, "")
	}
	uids := parentToChildMap[parent.UID]
	// Sort the children by name, then group, then by kind so that the output is deterministic
	sortedNodes := sortNodes(uids, uidToNodeMap)
	for i, childUid := range sortedNodes {
		var p string
		switch i {
		case len(uids) - 1:
			p = prefix + lastElemPrefix
		default:
			p = prefix + firstElemPrefix
		}
		treeViewAppGet(p, uidToNodeMap, parentToChildMap, uidToNodeMap[childUid], mapNodeNameToResourceState, w)
	}
}

// sortNodes sorts the nodes by kind then name (because those are the two visible fields in the tree view, in that
// order). If the nodes are the same kind and name, then sort by group, since a particular kind may be in different
// groups. If the nodes are the same kind, name, and group, then sort by namespace, since two otherwise-identical
// resources may be in two different namespaces.
//
// Since Kubernetes resources are uniquely identified by their group, kind, namespace, and name, this sorting ensures
// that the tree view is deterministic.
func sortNodes(uids []string, uidToNodeMap map[string]v1alpha1.ResourceNode) []string {
	sortedChs := make([]string, len(uids))
	copy(sortedChs, uids)
	sort.Slice(sortedChs, func(i, j int) bool {
		nodeI := uidToNodeMap[sortedChs[i]]
		nodeJ := uidToNodeMap[sortedChs[j]]
		if nodeI.Kind != nodeJ.Kind {
			return nodeI.Kind < nodeJ.Kind
		}
		if nodeI.Name == nodeJ.Name {
			return nodeI.Name < nodeJ.Name
		}
		if nodeI.Group != nodeJ.Group {
			return nodeI.Group < nodeJ.Group
		}
		return nodeI.Namespace < nodeJ.Namespace
	})
	return sortedChs
}

func detailedTreeViewAppGet(prefix string, uidToNodeMap map[string]v1alpha1.ResourceNode, parentChildMap map[string][]string, parent v1alpha1.ResourceNode, mapNodeNameToResourceState map[string]*resourceState, w *tabwriter.Writer) {
	healthStatus, reason := extractHealthStatusAndReason(parent)
	var age = "<unknown>"
	if parent.CreatedAt != nil {
		age = duration.HumanDuration(time.Since(parent.CreatedAt.Time))
	}

	if mapNodeNameToResourceState[parent.Kind+"/"+parent.Name] != nil {
		value := mapNodeNameToResourceState[parent.Kind+"/"+parent.Name]
		_, _ = fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\t%s\t%s\n", printPrefix(prefix), parent.Kind+"/"+value.Name, value.Status, value.Health, age, value.Message, reason)
	} else {
		_, _ = fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\t%s\t%s\n", printPrefix(prefix), parent.Kind+"/"+parent.Name, "", healthStatus, age, "", reason)

	}
	chs := parentChildMap[parent.UID]
	for i, child := range chs {
		var p string
		switch i {
		case len(chs) - 1:
			p = prefix + lastElemPrefix
		default:
			p = prefix + firstElemPrefix
		}
		detailedTreeViewAppGet(p, uidToNodeMap, parentChildMap, uidToNodeMap[child], mapNodeNameToResourceState, w)
	}
}

func treeViewAppResourcesNotOrphaned(prefix string, uidToNodeMap map[string]v1alpha1.ResourceNode, parentChildMap map[string][]string, parent v1alpha1.ResourceNode, w *tabwriter.Writer) {
	if len(parent.ParentRefs) == 0 {
		_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", parent.Group, parent.Kind, parent.Namespace, parent.Name, "No")
	}
	chs := parentChildMap[parent.UID]
	for i, child := range chs {
		var p string
		switch i {
		case len(chs) - 1:
			p = prefix + lastElemPrefix
		default:
			p = prefix + firstElemPrefix
		}
		treeViewAppResourcesNotOrphaned(p, uidToNodeMap, parentChildMap, uidToNodeMap[child], w)
	}
}

func treeViewAppResourcesOrphaned(prefix string, uidToNodeMap map[string]v1alpha1.ResourceNode, parentChildMap map[string][]string, parent v1alpha1.ResourceNode, w *tabwriter.Writer) {
	_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", parent.Group, parent.Kind, parent.Namespace, parent.Name, "Yes")
	chs := parentChildMap[parent.UID]
	for i, child := range chs {
		var p string
		switch i {
		case len(chs) - 1:
			p = prefix + lastElemPrefix
		default:
			p = prefix + firstElemPrefix
		}
		treeViewAppResourcesOrphaned(p, uidToNodeMap, parentChildMap, uidToNodeMap[child], w)
	}
}

func detailedTreeViewAppResourcesNotOrphaned(prefix string, uidToNodeMap map[string]v1alpha1.ResourceNode, parentChildMap map[string][]string, parent v1alpha1.ResourceNode, w *tabwriter.Writer) {

	if len(parent.ParentRefs) == 0 {
		healthStatus, reason := extractHealthStatusAndReason(parent)
		var age = "<unknown>"
		if parent.CreatedAt != nil {
			age = duration.HumanDuration(time.Since(parent.CreatedAt.Time))
		}
		_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", parent.Group, parent.Kind, parent.Namespace, parent.Name, "No", age, healthStatus, reason)
	}
	chs := parentChildMap[parent.UID]
	for i, child := range chs {
		var p string
		switch i {
		case len(chs) - 1:
			p = prefix + lastElemPrefix
		default:
			p = prefix + firstElemPrefix
		}
		detailedTreeViewAppResourcesNotOrphaned(p, uidToNodeMap, parentChildMap, uidToNodeMap[child], w)
	}
}

func detailedTreeViewAppResourcesOrphaned(prefix string, uidToNodeMap map[string]v1alpha1.ResourceNode, parentChildMap map[string][]string, parent v1alpha1.ResourceNode, w *tabwriter.Writer) {
	healthStatus, reason := extractHealthStatusAndReason(parent)
	var age = "<unknown>"
	if parent.CreatedAt != nil {
		age = duration.HumanDuration(time.Since(parent.CreatedAt.Time))
	}
	_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", parent.Group, parent.Kind, parent.Namespace, parent.Name, "Yes", age, healthStatus, reason)

	chs := parentChildMap[parent.UID]
	for i, child := range chs {
		var p string
		switch i {
		case len(chs) - 1:
			p = prefix + lastElemPrefix
		default:
			p = prefix + firstElemPrefix
		}
		detailedTreeViewAppResourcesOrphaned(p, uidToNodeMap, parentChildMap, uidToNodeMap[child], w)
	}
}

func printPrefix(p string) string {

	if strings.HasSuffix(p, firstElemPrefix) {
		p = strings.Replace(p, firstElemPrefix, pipe, strings.Count(p, firstElemPrefix)-1)
	} else {
		p = strings.ReplaceAll(p, firstElemPrefix, pipe)
	}

	if strings.HasSuffix(p, lastElemPrefix) {
		p = strings.Replace(p, lastElemPrefix, strings.Repeat(" ", len([]rune(lastElemPrefix))), strings.Count(p, lastElemPrefix)-1)
	} else {
		p = strings.ReplaceAll(p, lastElemPrefix, strings.Repeat(" ", len([]rune(lastElemPrefix))))
	}
	return p
}
